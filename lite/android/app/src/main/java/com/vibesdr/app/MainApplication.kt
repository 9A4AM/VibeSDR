package com.vibesdr.app

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.uimanager.ViewManager
import com.facebook.soloader.SoLoader
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage
import com.reactnativecommunity.slider.ReactSliderPackage
import com.th3rdwave.safeareacontext.SafeAreaContextPackage

/** The two bridge modules ServerModeScreen talks to — the main app's own classes, synced at build. */
class LitePackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(VibeLocalSdrModule(ctx), VibeMdnsModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class MainApplication : Application(), ReactApplication {
    // ★ No autolinking (no React Native Gradle plugin — see settings.gradle): the list is by hand,
    //   and it is short because the screen needs exactly this much.
    override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> = listOf(
            MainReactPackage(), AsyncStoragePackage(), ReactSliderPackage(), SafeAreaContextPackage(), LitePackage())
        override fun getJSMainModuleName(): String = "index"
        override fun getBundleAssetName(): String = "index.android.bundle"
        override fun getUseDeveloperSupport(): Boolean = false
        override val isNewArchEnabled: Boolean = false
        override val isHermesEnabled: Boolean = true
    }

    override fun onCreate() {
        super.onCreate()
        /* ★★★ LITE SPREADS THE RECEIVER OVER THE CORES (2026-09-18). A 2017 Fire 7 has four
         *  Cortex-A7s, and WFM stereo pinned ONE of them — vibe-dsp at ~99 % — while two sat idle
         *  and the audio surged. VIBE_DSP_THREADS=1 moves the spectrum FFT and the whole
         *  demodulator (with the Opus encode) onto their own threads; see RxPipeline::setDemodThread.
         *  Set before the engine starts: RxPipeline reads it in start(). The main app does not set it. */
        try { android.system.Os.setenv("VIBE_DSP_THREADS", "1", true) } catch (_: Throwable) {}
        SoLoader.init(this, false)
    }
}
