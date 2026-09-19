package com.vibesdr.app

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * VibeServer Lite, stage 2 — the screen is the MAIN app's ServerModeScreen.tsx, verbatim, on React
 * Native 0.73 (see lite/app/index.js). Stage 1's plain-Kotlin proof screen is in the history
 * (b5429f7a); it answered "will it even host" on a 2017 Fire 7 and was then replaced by this.
 */
class MainActivity : ReactActivity() {
    companion object {
        // ★ The shared VibeLocalSdrModule reads and clears this (consumeUsbLaunch) exactly as it does
        //   in the main app: true once when a dongle being plugged in is what opened the app.
        @Volatile @JvmField var usbLaunchPending = false
    }
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        if (intent?.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED) usbLaunchPending = true
        super.onCreate(null)      // null: nothing of ours is saved, and RN screens must not be restored from a bundle
    }
    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        if (intent?.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED) usbLaunchPending = true
    }
    // ★ On a TV the remote drives rows + a highlight (TvNav.kt); elsewhere this stays null and nothing changes.
    private var tvNav: TvNav? = null
    override fun onPostCreate(savedInstanceState: android.os.Bundle?) {
        super.onPostCreate(savedInstanceState)
        if (TvTextInputManager.isTv(this)) tvNav = TvNav(this)
    }
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean =
        tvNav?.handle(event) == true || super.dispatchKeyEvent(event)
    override fun getMainComponentName(): String = "VibeServerLite"
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, false)
}
