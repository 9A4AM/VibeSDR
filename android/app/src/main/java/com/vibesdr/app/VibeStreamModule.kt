package com.vibesdr.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge — exposed as "VibePowerModule" to mirror the iOS module, so
 * AudioPlayer/SDRScreen drive ONE API on both platforms. The engine itself
 * lives in VibeStreamService (foreground service keeps audio alive in the
 * background); startAudioEngine goes via startForegroundService, everything
 * else through the running service instance.
 */
class VibeStreamModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        VibeStreamService.reactContext = reactContext
    }

    override fun getName() = "VibePowerModule"

    @ReactMethod
    fun startAudioEngine(baseUrl: String, frequency: Double, mode: String, uuid: String) {
        VibeStreamService.reactContext = reactContext
        val intent = Intent(reactContext, VibeStreamService::class.java).apply {
            action = VibeStreamService.ACTION_START
            putExtra(VibeStreamService.EXTRA_BASE_URL, baseUrl)
            putExtra(VibeStreamService.EXTRA_FREQUENCY, frequency.toLong())
            putExtra(VibeStreamService.EXTRA_MODE, mode)
            putExtra(VibeStreamService.EXTRA_UUID, uuid)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopAudioEngine() {
        reactContext.startService(
            Intent(reactContext, VibeStreamService::class.java).apply {
                action = VibeStreamService.ACTION_STOP
            }
        )
    }

    @ReactMethod
    fun revive() { VibeStreamService.instance?.revive() }

    @ReactMethod
    fun sendTuneCommand(frequency: Double, mode: String) {
        VibeStreamService.instance?.sendTuneCommand(frequency.toLong(), mode)
    }

    @ReactMethod
    fun sendBandwidth(low: Double, high: Double) {
        VibeStreamService.instance?.sendBandwidth(low.toLong(), high.toLong())
    }

    @ReactMethod
    fun setStep(hz: Double) { VibeStreamService.instance?.setStep(hz.toLong()) }

    @ReactMethod
    fun setInstanceName(name: String) {
        VibeStreamService.instance?.setInstanceNameNative(name)
    }

    @ReactMethod
    fun setMuted(muted: Boolean) { VibeStreamService.instance?.setMutedNative(muted) }

    @ReactMethod
    fun setVolume(volume: Double) {
        VibeStreamService.instance?.setVolumeNative(volume.toFloat())
    }

    /** Server-NR / squelch / gate commands ride the audio WS (iOS parity). */
    @ReactMethod
    fun sendAudioCommand(json: String) {
        VibeStreamService.instance?.sendRawCommand(json)
    }

    @ReactMethod
    fun setNowPlaying(title: String, artist: String) {
        VibeStreamService.instance?.setNowPlayingNative(title, artist)
    }

    @ReactMethod
    fun setArtwork(serverType: String) {
        VibeStreamService.instance?.setArtworkNative(serverType)
    }

    @ReactMethod
    fun setMediaSkipMode(mode: String) {
        VibeStreamService.instance?.skipMode = mode
    }

    // Client NR/NR2/NB are native Swift DSP on iOS; the Kotlin port hasn't
    // happened yet — accept the calls so JS stays platform-agnostic.
    @ReactMethod
    fun setNrMode(mode: String) { /* not yet implemented on Android */ }

    @ReactMethod
    fun setNoiseBlanker(on: Boolean) { /* not yet implemented on Android */ }

    // Recording is iOS-only for now; reject so the JS .catch path fires
    // (SDRScreen shows its own not-supported alert before calling anyway).
    @ReactMethod
    fun startRecording(promise: Promise) {
        promise.reject("unsupported", "Recording is not yet supported on Android")
    }

    @ReactMethod
    fun stopRecording(promise: Promise) { promise.resolve(null) }

    @ReactMethod
    fun shareRecording(path: String) { /* iOS-only */ }

    // NativeEventEmitter housekeeping (events arrive via RCTDeviceEventEmitter)
    @ReactMethod
    fun addListener(eventName: String) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Double) { /* no-op */ }
}
