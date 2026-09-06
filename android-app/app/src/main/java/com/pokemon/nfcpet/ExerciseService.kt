package com.pokemon.nfcpet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder

/**
 * 运动记录前台服务：GPS 记点 → 累计距离（Haversine 由 Location.distanceTo 完成）。
 * 每满 1 公里自动 +1 颗神奇糖果（糖果账本也在本服务的 SharedPreferences）。
 *
 * 数据都落在 SharedPreferences("exercise")，主界面 H5 通过 PetBridge 轮询读取，
 * 不依赖进程存活——App 被杀后重新打开也能看到最新距离。
 */
class ExerciseService : Service() {

    private var locationManager: LocationManager? = null
    private var lastLoc: Location? = null
    private var lastFixMs = 0L
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private val notifMgr by lazy { getSystemService(NOTIFICATION_SERVICE) as NotificationManager }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
        startTracking()
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        try {
            locationManager?.removeUpdates(listener)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    /* ─── GPS 记点 ─── */

    private val listener = object : LocationListener {
        override fun onLocationChanged(loc: Location) {
            // 精度太差（>30m）的点丢弃，防止室内漂移虚增距离
            if (!loc.hasAccuracy() || loc.accuracy > 30f) return
            val last = lastLoc
            if (last == null) {
                lastLoc = loc
                lastFixMs = loc.time
                updateNotification()
                return
            }
            val d = last.distanceTo(loc)
            val dt = Math.max(1, (loc.time - lastFixMs) / 1000) // 秒
            val speed = d / dt
            // 跳变过滤：速度 > 12 m/s（43 km/h）大概率是 GPS 漂移；<1m 是噪声
            if (d < 1f || speed > 12f) {
                lastLoc = loc
                lastFixMs = loc.time
                return
            }
            val total = prefs.getFloat(KEY_METERS, 0f) + d
            prefs.edit().putFloat(KEY_METERS, total).apply()

            // 每满 1 公里自动 +1 糖果
            var mark = prefs.getFloat(KEY_CANDY_MARK, 0f)
            var candies = prefs.getInt(KEY_CANDIES, 0)
            var granted = 0
            while (total - mark >= 1000f) {
                mark += 1000f
                candies += 1
                granted++
            }
            if (granted > 0) {
                prefs.edit()
                    .putFloat(KEY_CANDY_MARK, mark)
                    .putInt(KEY_CANDIES, candies)
                    .apply()
            }

            lastLoc = loc
            lastFixMs = loc.time
            updateNotification(granted > 0)
        }

        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    private fun startTracking() {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        locationManager = lm
        val provider = when {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> LocationManager.GPS_PROVIDER
        }
        try {
            // 2 秒 / 1.5 米一个点：步行速度下足够平滑
            lm.requestLocationUpdates(provider, 2000L, 1.5f, listener)
        } catch (_: SecurityException) {
            // 权限被中途收回：停掉自己
            stopSelf()
        } catch (_: Exception) {
        }
    }

    /* ─── 通知 ─── */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(
                CHANNEL_ID, "运动记录", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "记录运动距离（每 1 公里获得 1 颗神奇糖果）"
                setShowBadge(false)
            }
            notifMgr.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val total = prefs.getFloat(KEY_METERS, 0f)
        return builder
            .setContentTitle("运动记录中 · %.2f km".format(total / 1000))
            .setContentText("每 1 公里自动获得 1 颗神奇糖果 🍬")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(gotCandy: Boolean = false) {
        try {
            notifMgr.notify(NOTIF_ID, buildNotification())
        } catch (_: Exception) {
        }
    }

    companion object {
        const val PREFS = "exercise"
        const val KEY_METERS = "meters"       // 累计运动距离（米）
        const val KEY_CANDIES = "candies"     // 糖果账本
        const val KEY_CANDY_MARK = "candy_mark" // 上次发糖的里程标记
        const val CHANNEL_ID = "exercise"
        const val NOTIF_ID = 10

        @Volatile
        var running = false
            private set
    }
}
