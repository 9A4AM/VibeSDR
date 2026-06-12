package com.vibesdr.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.TimeUnit

/**
 * Native audio engine + foreground service — Android mirror of the iOS
 * VibePowerModule pipeline (the old ExoPlayer /audio/stream HTTP path cannot
 * connect to v2 servers; audio rides the session WebSocket now).
 *
 * Packet layout (version=2, always 21-byte header):
 *   [0:8]   uint64 LE  timestamp
 *   [8:12]  uint32 LE  sample rate (encoder input rate — informational)
 *   [12]    uint8      channels
 *   [13:17] float32 LE baseband power
 *   [17:21] float32 LE noise density
 *   [21:]   Opus payload
 *
 * Design notes:
 *  - MediaCodec "audio/opus" decoder configured ONCE at 48 kHz. Opus payloads
 *    are rate-agnostic, so the server's per-mode sample-rate flips (linear
 *    12k / FM 24k) need no decoder or AudioTrack rebuilds — the half-speed
 *    race the iOS engine had cannot exist here by construction.
 *  - Single decode thread owns codec + AudioTrack; the WS callback only
 *    enqueues. Bounded deque drops OLDEST on overflow so playback hugs the
 *    live edge (iOS queuedSeconds parity).
 *  - Watchdog: packets flow ~50/s; >8s stale or dead socket → reopen with
 *    the SAME session uuid (a fresh one orphans decoders/spectrum WS
 *    server-side — "no active audio session").
 */
class VibeStreamService : Service() {

    companion object {
        const val CHANNEL_ID = "vibesdr_audio"
        const val NOTIF_ID = 1
        const val ACTION_PLAY = "com.vibesdr.app.PLAY"
        const val ACTION_PAUSE = "com.vibesdr.app.PAUSE"
        const val ACTION_STOP = "com.vibesdr.app.STOP"
        const val ACTION_NEXT = "com.vibesdr.app.NEXT"
        const val ACTION_PREV = "com.vibesdr.app.PREV"
        const val ACTION_START = "com.vibesdr.app.START"
        const val EXTRA_BASE_URL = "baseUrl"
        const val EXTRA_FREQUENCY = "frequency"
        const val EXTRA_MODE = "mode"
        const val EXTRA_UUID = "uuid"

        private const val TAG = "VibeStream"
        private const val HEADER_LEN = 21

        var reactContext: ReactApplicationContext? = null
        @Volatile var instance: VibeStreamService? = null
    }

    private var mediaSession: MediaSessionCompat? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Engine state ─────────────────────────────────────────────────────────
    @Volatile private var running = false
    @Volatile private var muted = false
    @Volatile private var volume = 1f
    @Volatile private var currentFreq = 14_074_000L
    @Volatile private var currentMode = "usb"
    @Volatile private var currentStep = 1_000L
    private var currentBase = ""
    private var currentUuid = ""
    private var instanceName = ""
    @Volatile private var lastPacketAt = 0L
    @Volatile private var packetCount = 0

    private var httpClient: OkHttpClient? = null
    @Volatile private var ws: WebSocket? = null
    private val packetQueue = LinkedBlockingDeque<ByteArray>(32)
    private var decodeThread: Thread? = null

    private var watchdog: Runnable? = null
    // Tune coalescing: the velocity drum can emit 20+ steps/s; one WS tune
    // per step thrashes radiod. Leading send + 80ms trailing timer.
    private var pendingTuneFreq = 0L
    private var pendingTuneMode = ""
    private var hasPendingTune = false
    private var lastTuneSentAt = 0L
    private var tuneFlush: Runnable? = null

    // ── Service lifecycle ────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        setupMediaSession()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val base = intent.getStringExtra(EXTRA_BASE_URL) ?: return START_STICKY
                val freq = intent.getLongExtra(EXTRA_FREQUENCY, 14_074_000L)
                val mode = intent.getStringExtra(EXTRA_MODE) ?: "usb"
                val uuid = intent.getStringExtra(EXTRA_UUID) ?: return START_STICKY
                startAudioEngine(base, freq, mode, uuid)
            }
            ACTION_PLAY -> setMutedNative(false)
            ACTION_PAUSE -> setMutedNative(true)
            ACTION_STOP -> { stopEngine(); stopSelf(); return START_NOT_STICKY }
            ACTION_NEXT -> tuneByStep(+1)
            ACTION_PREV -> tuneByStep(-1)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopEngine()
        mediaSession?.release()
        instance = null
        super.onDestroy()
    }

    // ── Engine control (called from VibeStreamModule / media controls) ───────

    fun startAudioEngine(baseUrl: String, frequency: Long, mode: String, uuid: String) {
        Log.i(TAG, "startAudioEngine $baseUrl $frequency $mode")
        stopEngine()
        currentBase = baseUrl
        currentFreq = frequency
        currentMode = mode
        currentUuid = uuid
        running = true
        muted = false
        packetCount = 0
        lastPacketAt = SystemClock.elapsedRealtime()
        packetQueue.clear()
        startDecodeThread()
        openWs()
        startWatchdog()
        mediaSession?.isActive = true
        updateMetadataSession()
        updatePlaybackState(PlaybackStateCompat.STATE_PLAYING)
        startForeground(NOTIF_ID, buildNotification())
    }

    fun stopEngine() {
        running = false
        watchdog?.let { mainHandler.removeCallbacks(it) }
        watchdog = null
        tuneFlush?.let { mainHandler.removeCallbacks(it) }
        tuneFlush = null
        ws?.close(1001, "going away")
        ws = null
        packetQueue.clear()
        decodeThread?.interrupt()
        decodeThread = null
        mediaSession?.isActive = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    fun sendTuneCommand(frequency: Long, mode: String) {
        currentFreq = frequency
        currentMode = mode
        mainHandler.post {
            pendingTuneFreq = frequency
            pendingTuneMode = mode
            hasPendingTune = true
            val since = SystemClock.elapsedRealtime() - lastTuneSentAt
            if (since >= 80) {
                flushPendingTune()
            } else if (tuneFlush == null) {
                val r = Runnable { tuneFlush = null; flushPendingTune() }
                tuneFlush = r
                mainHandler.postDelayed(r, 80 - since)
            }
            updateMetadataSession()
            updateNotification()
        }
    }

    private fun flushPendingTune() {
        if (!hasPendingTune) return
        hasPendingTune = false
        lastTuneSentAt = SystemClock.elapsedRealtime()
        sendWsJson(JSONObject().put("type", "tune")
            .put("frequency", pendingTuneFreq).put("mode", pendingTuneMode))
        // Drop queued (pre-tune) audio so what you HEAR snaps to the new
        // frequency — fine-tuning SSB through a stale backlog is impossible.
        packetQueue.clear()
    }

    fun sendBandwidth(low: Long, high: Long) {
        sendWsJson(JSONObject().put("type", "tune")
            .put("bandwidthLow", low).put("bandwidthHigh", high))
    }

    fun setStep(hz: Long) { currentStep = hz }

    fun setInstanceNameNative(name: String) {
        instanceName = name
        mainHandler.post { updateMetadataSession(); updateNotification() }
    }

    fun setMutedNative(m: Boolean) {
        muted = m
        if (m) packetQueue.clear()
        emitEvent("VibeMuted") { it.putBoolean("muted", m) }
        mainHandler.post {
            updatePlaybackState(
                if (m) PlaybackStateCompat.STATE_PAUSED else PlaybackStateCompat.STATE_PLAYING
            )
            updateMetadataSession()
            updateNotification()
        }
    }

    fun setVolumeNative(v: Float) {
        volume = v.coerceIn(0f, 1f)
        track?.setVolume(volume)
    }

    fun sendRawCommand(json: String) {
        val sock = ws ?: return
        sock.send(json)
    }

    fun revive() {
        mainHandler.post { reviveIfDead(3_000) }
    }

    private fun tuneByStep(direction: Int) {
        val newFreq = (currentFreq + direction * currentStep).coerceAtLeast(100_000L)
        currentFreq = newFreq
        sendWsJson(JSONObject().put("type", "tune").put("frequency", newFreq))
        emitEvent("VibeTuned") {
            it.putDouble("frequency", newFreq.toDouble())
            it.putString("mode", currentMode)
        }
        mainHandler.post { updateMetadataSession(); updateNotification() }
    }

    // ── WebSocket ────────────────────────────────────────────────────────────

    private fun wsUrl(): String {
        var s = currentBase.trim().trimEnd('/')
        s = when {
            s.startsWith("https://") -> "wss://" + s.removePrefix("https://")
            s.startsWith("http://") -> "ws://" + s.removePrefix("http://")
            else -> s
        }
        return "$s/ws?user_session_id=$currentUuid&frequency=$currentFreq" +
            "&mode=$currentMode&format=opus&version=2"
    }

    private fun openWs() {
        val client = httpClient ?: OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(20, TimeUnit.SECONDS)
            .build().also { httpClient = it }
        val url = wsUrl()
        Log.i(TAG, "opening audio WS: $url")
        val socket = client.newWebSocket(Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    if (!running || ws !== webSocket) return
                    packetCount++
                    lastPacketAt = SystemClock.elapsedRealtime()
                    if (packetCount <= 3) Log.i(TAG, "ws pkt#$packetCount len=${bytes.size}")
                    if (!muted) {
                        // Live-edge bound: drop OLDEST on overflow
                        val arr = bytes.toByteArray()
                        if (!packetQueue.offerLast(arr)) {
                            packetQueue.pollFirst()
                            packetQueue.offerLast(arr)
                        }
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (!running || ws !== webSocket) return
                    // dsp_filters / dsp_status / dsp_error etc. — JS owns the
                    // server-NR UI (same event name as iOS)
                    emitEvent("VibeWsText") { it.putString("text", text) }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (!running || ws !== webSocket) return
                    Log.w(TAG, "ws failure: ${t.message} — reconnecting in 2s")
                    mainHandler.postDelayed({
                        // SAME uuid — decoders + spectrum WS are keyed to it
                        if (running && ws === webSocket) { ws = null; openWs() }
                    }, 2_000)
                }
            })
        ws = socket
    }

    private fun sendWsJson(obj: JSONObject) {
        ws?.send(obj.toString())
    }

    // ── Watchdog (zombie-socket revive, iOS parity) ──────────────────────────

    private fun startWatchdog() {
        watchdog?.let { mainHandler.removeCallbacks(it) }
        val r = object : Runnable {
            override fun run() {
                if (!running) return
                reviveIfDead(8_000)
                mainHandler.postDelayed(this, 4_000)
            }
        }
        watchdog = r
        mainHandler.postDelayed(r, 4_000)
    }

    private fun reviveIfDead(staleAfterMs: Long) {
        if (!running) return
        val stale = SystemClock.elapsedRealtime() - lastPacketAt
        if (stale <= staleAfterMs && ws != null) return
        Log.i(TAG, "watchdog: stale=${stale}ms — reviving audio WS")
        lastPacketAt = SystemClock.elapsedRealtime() // debounce one revive/window
        ws?.cancel()
        ws = null
        openWs()
    }

    // ── Decode thread: MediaCodec opus → AudioTrack ──────────────────────────

    private var codec: MediaCodec? = null
    private var codecChannels = 0
    @Volatile private var track: AudioTrack? = null
    private var trackRate = 0
    private var trackChannels = 0
    private var ptsUs = 0L

    private fun startDecodeThread() {
        val t = Thread({
            try {
                decodeLoop()
            } catch (e: InterruptedException) {
                // normal shutdown
            } catch (e: Exception) {
                Log.e(TAG, "decode loop died: ${e.message}", e)
            } finally {
                releaseCodec()
                track?.release()
                track = null
                trackRate = 0
                trackChannels = 0
            }
        }, "vibesdr-decode")
        t.priority = Thread.MAX_PRIORITY
        decodeThread = t
        t.start()
    }

    private fun decodeLoop() {
        val info = MediaCodec.BufferInfo()
        while (running) {
            val pkt = packetQueue.poll(250, TimeUnit.MILLISECONDS) ?: continue
            if (pkt.size <= HEADER_LEN) continue
            val ch = pkt[12].toInt() and 0xFF
            if (ch != 1 && ch != 2) continue
            val opusLen = pkt.size - HEADER_LEN
            if (opusLen < 3) continue

            // Channel-count flip → rebuild codec synchronously (no race:
            // this thread owns codec + track exclusively)
            if (codec == null || codecChannels != ch) ensureCodec(ch)
            val c = codec ?: continue

            // Feed input (drain between attempts so the decoder never stalls)
            var fed = false
            var attempts = 0
            while (!fed && attempts < 50 && running) {
                val inIdx = c.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    val ib = c.getInputBuffer(inIdx) ?: break
                    ib.clear()
                    ib.put(pkt, HEADER_LEN, opusLen)
                    c.queueInputBuffer(inIdx, 0, opusLen, ptsUs, 0)
                    ptsUs += 20_000
                    fed = true
                }
                drainOutput(c, info)
                attempts++
            }
            drainOutput(c, info)
        }
    }

    private fun drainOutput(c: MediaCodec, info: MediaCodec.BufferInfo) {
        while (true) {
            val outIdx = c.dequeueOutputBuffer(info, 0)
            when {
                outIdx >= 0 -> {
                    val ob = c.getOutputBuffer(outIdx)
                    if (ob != null && info.size > 0) {
                        val pcm = ByteArray(info.size)
                        ob.position(info.offset)
                        ob.get(pcm, 0, info.size)
                        ensureTrackFor(c.outputFormat)
                        track?.write(pcm, 0, pcm.size)  // blocking = backpressure
                    }
                    c.releaseOutputBuffer(outIdx, false)
                }
                outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    ensureTrackFor(c.outputFormat)
                }
                else -> return
            }
        }
    }

    private fun ensureCodec(ch: Int) {
        releaseCodec()
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, 48_000, ch)
        format.setByteBuffer("csd-0", ByteBuffer.wrap(opusHead(ch)))
        format.setByteBuffer("csd-1", ByteBuffer.wrap(le64(0)))           // pre-skip ns
        format.setByteBuffer("csd-2", ByteBuffer.wrap(le64(80_000_000)))  // seek pre-roll ns
        val c = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
        c.configure(format, null, null, 0)
        c.start()
        codec = c
        codecChannels = ch
        ptsUs = 0
        Log.i(TAG, "opus decoder created ch=$ch")
    }

    private fun releaseCodec() {
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        codec = null
        codecChannels = 0
    }

    /** OpusHead identification header (RFC 7845 §5.1) for MediaCodec csd-0. */
    private fun opusHead(ch: Int): ByteArray {
        val b = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
        b.put("OpusHead".toByteArray(Charsets.US_ASCII))
        b.put(1)                 // version
        b.put(ch.toByte())       // channel count
        b.putShort(0)            // pre-skip
        b.putInt(48_000)         // input sample rate (informational)
        b.putShort(0)            // output gain
        b.put(0)                 // mapping family
        return b.array()
    }

    private fun le64(v: Long): ByteArray =
        ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(v).array()

    private fun ensureTrackFor(format: MediaFormat) {
        val rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val ch = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        if (track != null && trackRate == rate && trackChannels == ch) return
        track?.release()
        val mask = if (ch == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
        val minBuf = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate)
                    .setChannelMask(mask)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minBuf * 2, 9_600 * ch)) // ≥100ms
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        t.setVolume(volume)
        t.play()
        track = t
        trackRate = rate
        trackChannels = ch
        Log.i(TAG, "AudioTrack ${rate}Hz ${ch}ch")
    }

    // ── Events to JS ─────────────────────────────────────────────────────────

    private fun emitEvent(name: String, fill: (com.facebook.react.bridge.WritableMap) -> Unit) {
        val ctx = reactContext ?: return
        try {
            val map = Arguments.createMap()
            fill(map)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, map)
        } catch (e: Exception) {
            Log.w(TAG, "emit $name failed: ${e.message}")
        }
    }

    // ── Notification / MediaSession ──────────────────────────────────────────

    private fun nowPlayingTitle(): String {
        val mhz = String.format("%.3f MHz", currentFreq / 1_000_000.0)
        return "$mhz ${currentMode.uppercase()}${if (muted) " ·muted·" else ""}"
    }

    private fun updateMetadataSession() {
        mediaSession?.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, nowPlayingTitle())
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ARTIST,
                    instanceName.ifEmpty { currentBase }
                )
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "VibeSDR")
                .build()
        )
    }

    private fun updatePlaybackState(state: Int) {
        mediaSession?.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setState(state, -1L, 1f)
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_STOP
                )
                .build()
        )
    }

    private fun updateNotification() {
        if (!running) return
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIF_ID, buildNotification())
    }

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "VibeSDR").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                // Play/pause = unmute/mute, skips = tune ± step (iOS parity)
                override fun onPlay() { setMutedNative(false) }
                override fun onPause() { setMutedNative(true) }
                override fun onStop() { stopEngine(); stopSelf() }
                override fun onSkipToNext() { tuneByStep(+1) }
                override fun onSkipToPrevious() { tuneByStep(-1) }
            })
        }
        updatePlaybackState(PlaybackStateCompat.STATE_NONE)
    }

    private fun pi(requestCode: Int, action: String) = PendingIntent.getService(
        this, requestCode,
        Intent(this, VibeStreamService::class.java).apply { this.action = action },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentPi = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIcon = if (!muted) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
        val playPauseLabel = if (!muted) "Mute" else "Unmute"
        val playPauseAction = if (!muted) ACTION_PAUSE else ACTION_PLAY

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(nowPlayingTitle())
            .setContentText(instanceName.ifEmpty { currentBase })
            .setContentIntent(contentPi)
            .addAction(android.R.drawable.ic_media_previous, "Prev", pi(1, ACTION_PREV))
            .addAction(playPauseIcon, playPauseLabel, pi(2, playPauseAction))
            .addAction(android.R.drawable.ic_media_next, "Next", pi(3, ACTION_NEXT))
            .addAction(android.R.drawable.ic_delete, "Stop", pi(4, ACTION_STOP))
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession?.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "VibeSDR Audio",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "SDR audio stream"
                setSound(null, null)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
