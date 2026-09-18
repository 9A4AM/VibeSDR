package com.vibesdr.app

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

/**
 * VibeServer Lite, STAGE 1 — "will it even host" (Stuart, 2026-09-18, a 2017 Fire 7).
 *
 * ★ This screen is a PROOF, not the product. The product shows the main app's own VibeServer
 *   setup and status screens verbatim (ServerModeScreen.tsx on React Native 0.73, whose floor is
 *   API 21); that is stage 2. What is real here is everything under the screen: the same engine,
 *   the same VibeServerBoot.applyAndStart the main app and its crash-restore use, the same
 *   foreground service, the same tunnel and directory listing. Every setting takes the default
 *   VibeServerBoot gives it.
 * ★★ RTL dongles only for now — AGENTS.md: a control that works on one radio should not be there,
 *    so nothing radio-specific is offered at all until the real screen arrives.
 */
class MainActivity : Activity() {
    private val tag = "VibeLite"
    private val actionUsb = "com.vibesdr.serverlite.USB_PERMISSION"
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var nameBox: EditText
    private lateinit var listBox: CheckBox
    private lateinit var button: Button
    private var busy = false

    companion object {
        // ★ Held for the life of the PROCESS, not the activity: closing the connection pulls the
        //   fd out from under libusb, and the server outlives this screen.
        @Volatile var conn: UsbDeviceConnection? = null
        @Volatile var port: Int = 0
        @Volatile var servingName: String = ""
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            if (i?.action != actionUsb) return
            val granted = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (granted) start() else { busy = false; say("USB permission was refused.") }
        }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad); setBackgroundColor(Color.rgb(12, 14, 18)) }
        col.addView(TextView(this).apply { text = "VibeServer Lite"; textSize = 26f; setTextColor(Color.WHITE); typeface = Typeface.DEFAULT_BOLD })
        col.addView(TextView(this).apply { text = "engine ${BuildConfig.VERSION_NAME} · stage 1 test build"; textSize = 13f; setTextColor(Color.GRAY) })
        nameBox = EditText(this).apply { hint = "Server name"; setText(prefs().getString("name", "Fire 7 Lite")); setSingleLine(); setTextColor(Color.WHITE); setHintTextColor(Color.GRAY) }
        col.addView(nameBox)
        listBox = CheckBox(this).apply { text = "List publicly on VibeSDR.net (tunnel)"; setTextColor(Color.WHITE); isChecked = prefs().getBoolean("list", false) }
        if (VibeTunnel.isSupported(this)) col.addView(listBox)      // absent, not inert, without the binary
        button = Button(this).apply { textSize = 18f; setOnClickListener { if (port > 0) stop() else start() } }
        col.addView(button)
        status = TextView(this).apply { textSize = 15f; setTextColor(Color.rgb(200, 210, 220)); gravity = Gravity.START; setPadding(0, pad, 0, 0); setTextIsSelectable(true) }
        col.addView(status)
        setContentView(ScrollView(this).apply { addView(col) })
        val f = IntentFilter(actionUsb)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(usbReceiver, f, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(usbReceiver, f)
        tick()
    }

    override fun onDestroy() { try { unregisterReceiver(usbReceiver) } catch (_: Throwable) {}; ui.removeCallbacksAndMessages(null); super.onDestroy() }

    private fun prefs() = getSharedPreferences("lite", Context.MODE_PRIVATE)
    private fun say(s: String) = ui.post { status.text = s }

    private fun radio(mgr: UsbManager): UsbDevice? =
        mgr.deviceList.values.firstOrNull { VibeLocalSdrModule.RTL_SDR_VIDPIDS.contains((it.vendorId shl 16) or it.productId) }

    private fun lanIp(): String {
        val w = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION") val ip = w.connectionInfo?.ipAddress ?: 0
        return if (ip == 0) "0.0.0.0" else "${ip and 0xff}.${ip shr 8 and 0xff}.${ip shr 16 and 0xff}.${ip shr 24 and 0xff}"
    }

    private fun start() {
        val mgr = getSystemService(Context.USB_SERVICE) as UsbManager
        val dev = radio(mgr) ?: run { say("No RTL-SDR dongle found on the USB port."); return }
        if (!mgr.hasPermission(dev)) {
            busy = true; say("Asking for permission to use the dongle…")
            val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            mgr.requestPermission(dev, PendingIntent.getBroadcast(this, 0, Intent(actionUsb).setPackage(packageName), flags))
            return
        }
        busy = true
        val name = nameBox.text.toString().trim().ifEmpty { "VibeServer Lite" }
        val list = listBox.isChecked
        prefs().edit().putString("name", name).putBoolean("list", list).apply()
        say("Opening the dongle…")
        Thread({
            try {
                val c = mgr.openDevice(dev) ?: throw IllegalStateException("openDevice returned null")
                if (c.fileDescriptor < 0) { c.close(); throw IllegalStateException("bad file descriptor") }
                conn = c
                /* ★★★ LITE'S DEFAULTS ARE NOT THE MAIN APP'S — MEASURED ON THE FIRE 7, 2026-09-18.
                 *  The first live run took the main default of 2.4 MS/s: vibe-dsp sat at 100 % of a
                 *  core, the audio surged and the spectrum got 8-15 of its 20 fps. WFM stereo alone is
                 *  88 % of a Cortex-A7 at 2.4 MS/s and 51 % at 1.024, and the spectrum FFT shares that
                 *  thread. So: 1.024 MS/s, that as the listener's ceiling, 10 fps — and DAB allowed to
                 *  raise the rate for itself, since it needs 2.048 and measured 0.62 of a core. */
                val cfg = JSONObject().put("name", name)
                    .put("sampleRate", 1_024_000.0).put("maxBandwidthHz", 1_024_000.0)
                    .put("fftRate", 10.0).put("maxFftRate", 10.0)
                    .put("dabRateBoost", true)
                val p = VibeServerBoot.applyAndStart(cfg, c.fileDescriptor, dev.vendorId, dev.productId, filesDir)
                if (p <= 0) { c.close(); conn = null; throw IllegalStateException("the engine did not start (see logcat)") }
                port = p; servingName = name
                VibeServerBoot.startBatteryMonitor(applicationContext)
                RtlTcpServerService.start(applicationContext, name, lanIp(), p, "vibeserver")
                VibeServerRestore.arm(applicationContext, cfg)
                Log.i(tag, "serving \"$name\" on ${lanIp()}:$p")
                if (list) {
                    VibeTunnel.applyLoopbackTrust(true, "")
                    VibeTunnel.startTunnel(applicationContext, p) { url ->
                        if (url != null) VibeTunnel.publish(applicationContext, name, "", p, dev.productName ?: "RTL-SDR", "rtlsdr", "", "")
                    }
                }
            } catch (t: Throwable) {
                Log.e(tag, "start failed", t); say("Could not start: ${t.message}")
            } finally { busy = false }
        }, "vibe-lite-start").start()
    }

    private fun stop() {
        busy = true; say("Stopping…")
        Thread({
            try {
                VibeServerRestore.disarm(applicationContext)
                try { VibeTunnel.delist(applicationContext) } catch (_: Throwable) {}
                try { VibeTunnel.stopTunnel() } catch (_: Throwable) {}
                RtlTcpServerService.stop(applicationContext)
                try { VibeLocalSDR.stopSpectrumSync() } catch (_: Throwable) {}     // synchronous — see the main module
                VibeLocalSDR.setServeOnLan(false)
                conn?.let { try { it.close() } catch (_: Throwable) {} }; conn = null
                port = 0
            } finally { busy = false }
        }, "vibe-lite-stop").start()
    }

    /** One clock for the whole readout: every second, from the engine's and the tunnel's own status. */
    private fun tick() {
        ui.postDelayed({ tick() }, 1000)
        button.isEnabled = !busy
        button.text = if (port > 0) "Stop server" else "Start server"
        nameBox.isEnabled = port <= 0; listBox.isEnabled = port <= 0
        if (busy || port <= 0) { if (!busy && status.text.isNullOrEmpty()) status.text = "Plug in an RTL-SDR dongle and press Start."; return }
        val s = try { JSONObject(VibeLocalSDR.getVibeServerStatus()) } catch (_: Throwable) { JSONObject() }
        val t = try { JSONObject(VibeTunnel.statusJson()) } catch (_: Throwable) { JSONObject() }
        val sb = StringBuilder()
        sb.append("SERVING \"").append(servingName).append("\"\n\nOn this network:\n  http://").append(lanIp()).append(':').append(port).append("\n\n")
        sb.append("Listener: ").append(if (s.optBoolean("client")) s.optString("clientAddr", "connected") else "none").append('\n')
        sb.append("Spectrum ").append(s.optLong("specBytesPerSec") / 1024).append(" kB/s · audio ").append(s.optLong("audioBytesPerSec") / 1024).append(" kB/s\n")
        sb.append("Bandwidth ").append(s.optLong("bandwidthHz") / 1000).append(" kHz · FFT ").append(s.optLong("fftRate")).append(" fps\n\n")
        if (listBox.isChecked) {
            sb.append("Public listing: ")
            when {
                t.optBoolean("listed") -> sb.append("LISTED\n  ").append(t.optString("address")).append('\n')
                t.optBoolean("running") -> sb.append("tunnel up, listing…\n  ").append(t.optString("tunnelUrl")).append('\n')
                else -> sb.append("starting the tunnel…\n")
            }
            val e = t.optString("error"); if (e.isNotEmpty()) sb.append("  ! ").append(e).append('\n')
        }
        status.text = sb
    }
}
