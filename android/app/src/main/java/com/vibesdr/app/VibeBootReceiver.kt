package com.vibesdr.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * ★★ START THE SERVER WHEN THE DEVICE BOOTS — VibeServer Lite, and an OPTION (Stuart, 2026-09-19: "start on boot
 * needs to be a selectable option so that a user can disable it if it causes issues with the TV functioning as a
 * TV"). A TV box is the case: a power cut, the TV comes back into standby, and nobody walks to it to press Start.
 *
 * ★ Registered in the LITE manifest only. A phone's OTG stack generally does not enumerate a dongle that was
 *   attached while it was off (see VibeServerRestore), so the main app does not offer it; a TV's USB-A ports do.
 * ★ The same restore an update uses — whole saved config, and it waits for the dongle to appear. BOOT_COMPLETED
 *   is one of the documented exemptions that may start a foreground service from the background.
 * ★ The USB grant survives a reboot only if "use by default for this USB device" was ticked when the dongle was
 *   first allowed; otherwise the restore reports it and the server waits for the owner.
 */
class VibeBootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!VibeServerRestore.bootWanted(ctx)) {
            Log.i(TAG, "booted — start on boot is off, or the server was stopped on purpose")
            return
        }
        Log.i(TAG, "booted — starting the server (start on boot is on)")
        val svc = Intent(ctx, RtlTcpServerService::class.java).putExtra(RtlTcpServerService.EXTRA_RESTORE, true)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(svc) else ctx.startService(svc)
        } catch (t: Throwable) { Log.w(TAG, "could not start the server at boot: $t") }
    }
    private companion object { const val TAG = "VibeBootReceiver" }
}
