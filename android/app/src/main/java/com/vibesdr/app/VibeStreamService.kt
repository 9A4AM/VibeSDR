package com.vibesdr.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class VibeStreamService : Service() {

    inner class LocalBinder : Binder() {
        fun getService(): VibeStreamService = this@VibeStreamService
    }

    private val binder = LocalBinder()
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSessionCompat? = null
    private var currentTitle = "VibeSDR"
    private var currentArtist = "SDR Receiver"
    private var isPlaying = false

    companion object {
        const val CHANNEL_ID = "vibesdr_audio"
        const val NOTIF_ID = 1
        const val ACTION_PLAY   = "com.vibesdr.app.PLAY"
        const val ACTION_PAUSE  = "com.vibesdr.app.PAUSE"
        const val ACTION_STOP   = "com.vibesdr.app.STOP"
        const val ACTION_NEXT   = "com.vibesdr.app.NEXT"
        const val ACTION_PREV   = "com.vibesdr.app.PREV"
        const val ACTION_UPDATE = "com.vibesdr.app.UPDATE"
        const val EXTRA_URL    = "url"
        const val EXTRA_TITLE  = "title"
        const val EXTRA_ARTIST = "artist"

        var reactContext: ReactApplicationContext? = null
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupMediaSession()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY   -> resumeStream()
            ACTION_PAUSE  -> pauseStream()
            ACTION_STOP   -> { stopStream(); stopSelf(); return START_NOT_STICKY }
            ACTION_NEXT   -> sendEvent("vibeMediaControl", "next")
            ACTION_PREV   -> sendEvent("vibeMediaControl", "prev")
            ACTION_UPDATE -> {
                val title  = intent.getStringExtra(EXTRA_TITLE)  ?: currentTitle
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist
                updateMetadata(title, artist)
            }
            else -> {
                val url = intent?.getStringExtra(EXTRA_URL) ?: return START_STICKY
                val title  = intent.getStringExtra(EXTRA_TITLE)  ?: currentTitle
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist
                startStream(url, title, artist)
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        stopStream()
        mediaSession?.release()
        super.onDestroy()
    }

    fun startStream(url: String, title: String, artist: String) {
        currentTitle = title
        currentArtist = artist

        player?.release()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true
            )
            .build()
            .also { exo ->
                exo.setMediaItem(MediaItem.fromUri(url))
                exo.addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(playing: Boolean) {
                        isPlaying = playing
                        updatePlaybackState(
                            if (playing) PlaybackStateCompat.STATE_PLAYING
                            else PlaybackStateCompat.STATE_PAUSED
                        )
                        updateNotification()
                    }
                })
                exo.prepare()
                exo.playWhenReady = true
            }

        isPlaying = true
        updateMetadataSession(title, artist)
        updatePlaybackState(PlaybackStateCompat.STATE_BUFFERING)
        startForeground(NOTIF_ID, buildNotification())
    }

    private fun pauseStream() {
        player?.pause()
        isPlaying = false
        updatePlaybackState(PlaybackStateCompat.STATE_PAUSED)
        sendEvent("vibeMediaControl", "pause")
        updateNotification()
    }

    private fun resumeStream() {
        player?.play()
        isPlaying = true
        updatePlaybackState(PlaybackStateCompat.STATE_PLAYING)
        sendEvent("vibeMediaControl", "play")
        updateNotification()
    }

    fun stopStream() {
        player?.release()
        player = null
        isPlaying = false
        mediaSession?.isActive = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    fun updateMetadata(title: String, artist: String) {
        currentTitle = title
        currentArtist = artist
        updateMetadataSession(title, artist)
        updateNotification()
    }

    private fun updateMetadataSession(title: String, artist: String) {
        mediaSession?.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
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
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIF_ID, buildNotification())
    }

    private fun sendEvent(event: String, data: String) {
        reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, data)
    }

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "VibeSDR").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay()           { resumeStream() }
                override fun onPause()          { pauseStream() }
                override fun onStop()           { stopStream(); stopSelf() }
                override fun onSkipToNext()     { sendEvent("vibeMediaControl", "next") }
                override fun onSkipToPrevious() { sendEvent("vibeMediaControl", "prev") }
            })
            isActive = true
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

        val playPauseIcon   = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
        val playPauseLabel  = if (isPlaying) "Pause" else "Play"
        val playPauseAction = if (isPlaying) ACTION_PAUSE else ACTION_PLAY

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setContentIntent(contentPi)
            .addAction(android.R.drawable.ic_media_previous, "Prev", pi(1, ACTION_PREV))
            .addAction(playPauseIcon, playPauseLabel,                 pi(2, playPauseAction))
            .addAction(android.R.drawable.ic_media_next,     "Next", pi(3, ACTION_NEXT))
            .addAction(android.R.drawable.ic_delete,         "Stop", pi(4, ACTION_STOP))
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
