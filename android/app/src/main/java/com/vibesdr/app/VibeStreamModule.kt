package com.vibesdr.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VibeStreamModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        VibeStreamService.reactContext = reactContext
    }

    override fun getName() = "VibeStreamModule"

    @ReactMethod
    fun startStream(url: String, title: String, artist: String) {
        VibeStreamService.reactContext = reactContext
        val intent = Intent(reactContext, VibeStreamService::class.java).apply {
            putExtra(VibeStreamService.EXTRA_URL, url)
            putExtra(VibeStreamService.EXTRA_TITLE, title)
            putExtra(VibeStreamService.EXTRA_ARTIST, artist)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun updateMetadata(title: String, artist: String) {
        reactContext.startService(
            Intent(reactContext, VibeStreamService::class.java).apply {
                action = VibeStreamService.ACTION_UPDATE
                putExtra(VibeStreamService.EXTRA_TITLE, title)
                putExtra(VibeStreamService.EXTRA_ARTIST, artist)
            }
        )
    }

    @ReactMethod
    fun resume() {
        reactContext.startService(
            Intent(reactContext, VibeStreamService::class.java).apply {
                action = VibeStreamService.ACTION_PLAY
            }
        )
    }

    @ReactMethod
    fun stop() {
        reactContext.startService(
            Intent(reactContext, VibeStreamService::class.java).apply {
                action = VibeStreamService.ACTION_STOP
            }
        )
    }
}
