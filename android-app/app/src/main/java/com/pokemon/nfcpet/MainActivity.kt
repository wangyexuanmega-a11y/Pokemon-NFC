package com.pokemon.nfcpet

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * 宝可梦 NFC 宠物 —— 原生壳
 *
 * - 主界面 WebView：宝可梦选择界面（H5，?native=1）
 * - 内容优先从 GitHub Pages 在线加载（改内容不用重新装 APK），失败时回退到内置资源
 * - 悬浮宠物窗口：透明 WebView（TYPE_APPLICATION_OVERLAY）。窗口尺寸在召唤时由 H5
 *   按精灵图实际比例一次性算好传入（物理 px），原生创建后不再反馈式改尺寸——之前的
 *   “报告→改窗口”回路单位换算有误且会在部分机型造成画布拉伸（屏幕上出现方框）。
 *   拖拽 / 长按收起全部在原生层处理：后台 App 悬浮窗的 WebView 动画回调（RAF）会被
 *   系统冻结，之前的白圈卡住、长按关不掉就是 JS 计时依赖 RAF 造成的。
 * - NFC：前台调度 + NDEF 意图读取手环 → JS 桥接唤醒 → H5 走 summon 流程
 * - 运动记录：GPS 前台服务（ExerciseService）累计距离，每满 1 公里自动 +1 糖果
 */
class MainActivity : Activity() {

    private lateinit var mainWebView: WebView
    private var overlayRoot: FrameLayout? = null
    private var overlayWebView: WebView? = null
    private var pressRingView: PressRingView? = null
    private var currentBuddy: String? = null
    private var nfcAdapter: NfcAdapter? = null
    private var pageLoaded = false
    private var pendingBuddy: String? = null

    // 拖拽状态
    private var dragX = 0f
    private var dragY = 0f
    private var startLx = 0
    private var startLy = 0
    private var dragging = false

    // 宠物在悬浮窗内的实际显示区（物理 px；召唤时 H5 估算，悬浮页加载素材后校正）
    private var petRect = RectF()
    private var petRectOld = RectF()

    // 长按收起（原生检测，2 秒）
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pressRunning = false
    private val longPressRunnable = object : Runnable {
        override fun run() {
            if (pressRunning) {
                pressRunning = false
                pressRingView?.cancel()
                removeOverlay()
                vibrateShort()
                Toast.makeText(applicationContext, "已收起宝可梦", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // 步数（硬件计步传感器，账号资料用；糖果只来自运动距离）
    private var sensorManager: SensorManager? = null
    private var stepCounter: Sensor? = null
    private var stepDetectorMode = false
    private var lastSensorSteps = 0f
    private var lastPushMs = 0L
    private var lastPushedTotal = -1L
    private val prefs by lazy { getSharedPreferences("pet_steps", MODE_PRIVATE) }
    private val exercisePrefs by lazy { getSharedPreferences(ExerciseService.PREFS, MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        mainWebView = buildWebView()
        mainWebView.addJavascriptInterface(PetBridge(), "PetBridge")
        setContentView(mainWebView)
        mainWebView.loadUrl(overlayUrl("native=1"))

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        handleNfcIntent(intent)

        // 开屏先要悬浮窗权限（宠物需要悬浮在屏幕上）
        if (!Settings.canDrawOverlays(this)) {
            mainWebView.postDelayed({
                Toast.makeText(this, "需要「显示在其他应用上层」权限，宠物才能悬浮在屏幕上", Toast.LENGTH_LONG).show()
                startActivity(
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                )
            }, 600)
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.let { adapter ->
            val pendingIntent = PendingIntent.getActivity(
                this, 0,
                Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_MUTABLE
            )
            val filters = arrayOf(
                IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataType("text/plain") },
                IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataScheme("http") },
                IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataScheme("https") }
            )
            adapter.enableForegroundDispatch(this, pendingIntent, filters, null)
        }
        // 步数传感器
        initStepCounter()
        sensorManager?.registerListener(stepListener, stepCounter, SensorManager.SENSOR_DELAY_NORMAL)
        // 从系统设置页开完权限回来，自动补召唤
        val buddy = currentBuddy
        if (buddy != null && Settings.canDrawOverlays(this) && overlayRoot == null) {
            createOverlay(buddy, lastWinW, lastWinH)
        }
        // App 前台：隐藏悬浮宠物（由初始界面平台展示）
        overlayRoot?.visibility = View.GONE
    }

    override fun onStop() {
        super.onStop()
        // 回桌面：重新显示悬浮宠物
        overlayRoot?.visibility = View.VISIBLE
    }

    override fun onPause() {
        super.onPause()
        sensorManager?.unregisterListener(stepListener)
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    /* ─── WebView 工厂（在线加载 + 本地兜底） ─── */

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        val wv = WebView(this)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
        }

        // 在线内容加载失败时回退到内置资源（每个 WebView 独立标记）
        var fallbackLoaded = false
        fun fallbackUrl(remote: String?): String {
            val q = remote?.substringAfter('?', "")
            return if (q.isNullOrEmpty()) "$LOCAL_INDEX?native=1&v=$CONTENT_V"
            else "$LOCAL_INDEX?$q"
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame && !fallbackLoaded) {
                    fallbackLoaded = true
                    view.loadUrl(fallbackUrl(view.url))
                }
                super.onReceivedError(view, request, error)
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                if (request.isForMainFrame && !fallbackLoaded) {
                    fallbackLoaded = true
                    view.loadUrl(fallbackUrl(view.url))
                }
                super.onReceivedHttpError(view, request, errorResponse)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (view === mainWebView) {
                    pageLoaded = true
                    pendingBuddy?.let {
                        deliverBuddy(it)
                        pendingBuddy = null
                    }
                }
            }
        }
        return wv
    }

    /* ─── JS → 原生桥接 ─── */

    inner class PetBridge {

        /**
         * 召唤悬浮宠物。窗口尺寸与宠物显示区由 H5 按精灵图实际比例算好传入（物理 px，
         * H5 已乘 devicePixelRatio），原生创建后不再改窗口尺寸。
         */
        @JavascriptInterface
        fun summon(buddy: String, winW: Int, winH: Int, petLeft: Int, petTop: Int, petW: Int, petH: Int) =
            runOnUiThread {
                lastWinW = winW
                lastWinH = winH
                if (!Settings.canDrawOverlays(this@MainActivity)) {
                    Toast.makeText(this@MainActivity, "请允许「显示在其他应用上层」权限后再次召唤", Toast.LENGTH_LONG).show()
                    startActivity(
                        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                    )
                    return@runOnUiThread
                }
                currentBuddy = buddy
                createOverlay(buddy, winW, winH)
                setPetRectInternal(petLeft, petTop, petW, petH)
            }

        /** 缩放滑块变化：换新尺寸重载悬浮页（以宠物中心为锚，视觉上原地缩放） */
        @JavascriptInterface
        fun reloadOverlay(buddy: String, winW: Int, winH: Int, petLeft: Int, petTop: Int, petW: Int, petH: Int) =
            runOnUiThread {
                val b = currentBuddy ?: return@runOnUiThread
                val wv = overlayWebView ?: return@runOnUiThread
                lastWinW = winW
                lastWinH = winH
                val oldCx = petRectOld.centerX()
                val oldCy = petRectOld.centerY()
                setPetRectInternal(petLeft, petTop, petW, petH)
                val root = overlayRoot
                val lp = root?.layoutParams as? WindowManager.LayoutParams
                if (root != null && lp != null && winW > 0 && winH > 0 &&
                    (lp.width != winW || lp.height != winH)
                ) {
                    // 窗口位置补偿：保持宠物中心不动
                    val cxScreen = lp.x + oldCx
                    val cyScreen = lp.y + oldCy
                    lp.width = winW
                    lp.height = winH
                    lp.x = (cxScreen - petRect.centerX()).toInt()
                    lp.y = (cyScreen - petRect.centerY()).toInt()
                    try { windowManager.updateViewLayout(root, lp) } catch (_: Exception) {}
                }
                wv.loadUrl(overlayUrl("native=1&overlay=1&buddy=$b"))
            }

        /** 悬浮页加载完素材后校正宠物精确显示区（只更新触摸判定，不改窗口尺寸） */
        @JavascriptInterface
        fun setPetRect(left: Int, top: Int, width: Int, height: Int) = runOnUiThread {
            setPetRectInternal(left, top, width, height)
        }

        @JavascriptInterface
        fun dismiss() = runOnUiThread { removeOverlay() }

        /** 累计步数（账号资料） */
        @JavascriptInterface
        fun getTotalSteps(): Long = prefs.getLong("total", 0L)

        /** 初始界面右上角关闭：收起宠物并退出 App */
        @JavascriptInterface
        fun exit() = runOnUiThread {
            removeOverlay()
            finish()
        }

        /* ── 运动记录（GPS 距离 → 糖果） ── */

        @JavascriptInterface
        fun startExercise() = runOnUiThread { requestLocationAndStart() }

        @JavascriptInterface
        fun endExercise() = runOnUiThread {
            val total = exercisePrefs.getFloat(ExerciseService.KEY_METERS, 0f)
            val candies = exercisePrefs.getInt(ExerciseService.KEY_CANDIES, 0)
            stopService(Intent(this@MainActivity, ExerciseService::class.java))
            Toast.makeText(
                this@MainActivity,
                "运动结束，累计 %.2f km".format(total / 1000),
                Toast.LENGTH_SHORT
            ).show()
        }

        @JavascriptInterface
        fun isExercising(): Boolean = ExerciseService.running

        /** 累计运动距离（米） */
        @JavascriptInterface
        fun getExerciseMeters(): Float = exercisePrefs.getFloat(ExerciseService.KEY_METERS, 0f)

        /** 糖果账本（原生持久化，运动服务满 1km 自动加糖，清网页缓存也不丢） */
        @JavascriptInterface
        fun getCandies(): Int = exercisePrefs.getInt(ExerciseService.KEY_CANDIES, 0)

        @JavascriptInterface
        fun addCandy(n: Int) {
            if (n <= 0) return
            exercisePrefs.edit()
                .putInt(ExerciseService.KEY_CANDIES, exercisePrefs.getInt(ExerciseService.KEY_CANDIES, 0) + n)
                .apply()
        }

        /** 消耗糖果（升级/进化），不足返回 false */
        @JavascriptInterface
        fun consumeCandy(n: Int): Boolean {
            val cur = exercisePrefs.getInt(ExerciseService.KEY_CANDIES, 0)
            if (cur < n) return false
            exercisePrefs.edit().putInt(ExerciseService.KEY_CANDIES, cur - n).apply()
            return true
        }
    }

    /* ─── 运动权限 ─── */

    private fun requestLocationAndStart() {
        if (hasLocationPermission()) {
            startExerciseService()
            return
        }
        // 同时申请通知权限（Android 13+ 前台服务通知需要）
        val perms = mutableListOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            perms.add(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions(perms.toTypedArray(), REQ_LOCATION)
    }

    private fun hasLocationPermission(): Boolean {
        return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_LOCATION) return
        if (hasLocationPermission()) {
            startExerciseService()
        } else {
            Toast.makeText(this, "需要定位权限才能记录运动距离", Toast.LENGTH_LONG).show()
            mainWebView.post {
                mainWebView.evaluateJavascript("window.__petExerciseDenied && window.__petExerciseDenied()", null)
            }
        }
    }

    private fun startExerciseService() {
        val intent = Intent(this, ExerciseService::class.java)
        startForegroundService(intent)
        Toast.makeText(this, "开始记录运动，去走走吧！锁屏也会继续记录", Toast.LENGTH_SHORT).show()
    }

    /* ─── 步数统计（账号资料） ─── */

    private fun initStepCounter() {
        if (sensorManager == null) {
            sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
            stepCounter = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            if (stepCounter == null) {
                stepCounter = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
                stepDetectorMode = stepCounter != null
            }
            lastSensorSteps = prefs.getFloat("last", 0f)
        }
    }

    private val stepListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val now = SystemClock.elapsedRealtime()
            if (stepDetectorMode) {
                val total = prefs.getLong("total", 0L) + 1
                prefs.edit().putLong("total", total).apply()
                if (total != lastPushedTotal && now - lastPushMs >= 1000) {
                    lastPushMs = now
                    lastPushedTotal = total
                    pushSteps(total)
                }
                return
            }
            val cur = event.values[0]
            val delta = cur - lastSensorSteps
            var total = prefs.getLong("total", 0L)
            when {
                delta < 0 -> {
                    // 手机重启过（计数清零）：把重启后已走的步数算上
                    total += cur.toLong()
                }
                delta >= 1 && delta < 50000 -> {
                    total += delta.toLong()
                }
            }
            lastSensorSteps = cur
            prefs.edit().putFloat("last", cur).putLong("total", total).apply()
            if (total != lastPushedTotal && now - lastPushMs >= 1000) {
                lastPushMs = now
                lastPushedTotal = total
                pushSteps(total)
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private fun pushSteps(total: Long) {
        mainWebView.post {
            mainWebView.evaluateJavascript("window.__petSteps && window.__petSteps($total)", null)
        }
    }

    /* ─── 悬浮宠物窗口（原生拖拽 + 原生长按收起） ─── */

    private var lastWinW = 0
    private var lastWinH = 0

    private fun setPetRectInternal(left: Int, top: Int, width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        petRectOld.set(petRect)
        petRect.set(left.toFloat(), top.toFloat(), (left + width).toFloat(), (top + height).toFloat())
        pressRingView?.setRingMetrics(petRect)
    }

    private fun createOverlay(buddy: String, winW: Int, winH: Int) {
        val metrics = resources.displayMetrics
        val useW = if (winW in dp(80)..metrics.widthPixels) winW else dp(200)
        val useH = if (winH in dp(80)..(metrics.heightPixels - dp(120))) winH else dp(220)

        if (overlayRoot == null) {
            val wv = buildWebView()
            wv.addJavascriptInterface(PetBridge(), "PetBridge")
            wv.setBackgroundColor(Color.TRANSPARENT)

            val ring = PressRingView(this)
            pressRingView = ring

            val root = FrameLayout(this)
            root.addView(
                wv,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
            )
            root.addView(
                ring,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
            )

            val lp = WindowManager.LayoutParams(
                useW, useH,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            )
            // 初始位置：屏幕底部居中；之后用户可拖拽（TOP|START 坐标模式）
            lp.gravity = Gravity.TOP or Gravity.START
            lp.x = (metrics.widthPixels - useW) / 2
            lp.y = metrics.heightPixels - useH - dp(30)
            windowManager.addView(root, lp)

            // 触摸全部由原生处理：宠物区域按下可拖拽 / 长按 2 秒收起。
            // 不再依赖 WebView 的 JS 事件——后台悬浮窗的 JS 动画回调会被系统冻结。
            val slop = ViewConfiguration.get(this).scaledTouchSlop
            root.setOnTouchListener { v, ev ->
                val oLp = v.layoutParams as WindowManager.LayoutParams
                when (ev.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        dragX = ev.rawX
                        dragY = ev.rawY
                        startLx = oLp.x
                        startLy = oLp.y
                        dragging = false
                        if (petRect.contains(ev.x, ev.y) && !pressRunning) {
                            pressRunning = true
                            ring.begin()
                            mainHandler.postDelayed(longPressRunnable, LONG_PRESS_MS)
                        }
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = ev.rawX - dragX
                        val dy = ev.rawY - dragY
                        if (!dragging && (Math.abs(dx) >= slop || Math.abs(dy) >= slop)) {
                            // 动了：取消长按，转为拖拽
                            cancelPress()
                            dragging = true
                        }
                        if (dragging) {
                            oLp.x = startLx + dx.toInt()
                            oLp.y = startLy + dy.toInt()
                            try {
                                windowManager.updateViewLayout(v, oLp)
                            } catch (_: Exception) {
                            }
                        }
                        true
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        cancelPress()
                        dragging = false
                        true
                    }
                    else -> true
                }
            }

            overlayRoot = root
            overlayWebView = wv
        } else {
            // 复用窗口但更新尺寸
            val root = overlayRoot!!
            val lp = root.layoutParams as? WindowManager.LayoutParams
            if (lp != null && (lp.width != useW || lp.height != useH)) {
                lp.width = useW
                lp.height = useH
                try { windowManager.updateViewLayout(root, lp) } catch (_: Exception) {}
            }
        }
        overlayWebView?.loadUrl(overlayUrl("native=1&overlay=1&buddy=$buddy"))
    }

    private fun cancelPress() {
        mainHandler.removeCallbacks(longPressRunnable)
        pressRunning = false
        pressRingView?.cancel()
    }

    private fun removeOverlay() {
        cancelPress()
        overlayRoot?.let { root ->
            if (root.parent != null) {
                try {
                    windowManager.removeView(root)
                } catch (_: Exception) {
                }
            }
        }
        overlayRoot = null
        overlayWebView = null
        pressRingView = null
        currentBuddy = null
    }

    private fun vibrateShort() {
        try {
            val v = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            v.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {
        }
    }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun overlayUrl(query: String): String = "$REMOTE_INDEX?$query&v=$CONTENT_V"

    /* ─── NFC ─── */

    private fun handleNfcIntent(intent: Intent) {
        if (intent.action != NfcAdapter.ACTION_NDEF_DISCOVERED) return
        val buddy = parseBuddy(intent) ?: return
        // 交给 H5 走 summon 流程（H5 → PetBridge.summon → 悬浮窗）
        if (pageLoaded) deliverBuddy(buddy) else pendingBuddy = buddy
    }

    /** 把 buddy id 注入主界面：window.__petNfc('bulbasaur') */
    private fun deliverBuddy(buddy: String) {
        val safe = buddy.replace("'", "").replace("\"", "")
        mainWebView.post {
            mainWebView.evaluateJavascript("window.__petNfc && window.__petNfc('$safe')", null)
        }
    }

    /** 从 NDEF 消息里解析 buddy id：优先 URL 的 ?buddy=xxx，其次纯文本 */
    private fun parseBuddy(intent: Intent): String? {
        val raw = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES) ?: return null
        for (rawMsg in raw) {
            val msg = rawMsg as? NdefMessage ?: continue
            for (record in msg.records) {
                when {
                    record.type.contentEquals(NdefRecord.RTD_URI) -> {
                        val uri = record.toUri() ?: continue
                        val m = Regex("[?&]buddy=([^&#]+)").find(uri.toString())
                        if (m != null) return Uri.decode(m.groupValues[1])
                    }
                    record.type.contentEquals(NdefRecord.RTD_TEXT) -> {
                        val text = decodeTextRecord(record) ?: continue
                        if (text.isNotBlank()) return text.trim()
                    }
                }
            }
        }
        return null
    }

    /** NDEF 文本记录解码：状态字节 + 语言码 + 文本 */
    private fun decodeTextRecord(record: NdefRecord): String? {
        val payload = record.payload
        if (payload.isEmpty()) return null
        val status = payload[0].toInt()
        val langLen = status and 0x3F
        if (payload.size < 1 + langLen) return null
        val encoding = if (status and 0x80 != 0) Charsets.UTF_8 else Charsets.UTF_16
        return String(payload, 1 + langLen, payload.size - 1 - langLen, encoding)
    }

    companion object {
        // 内容在线地址（改 pet-app 推 GitHub 即自动更新，无需重装 APK）。
        // v 参数：内容结构变化时递增，避免 WebView 缓存旧页面去调新版桥接方法。
        const val REMOTE_INDEX = "https://wangyexuanmega-a11y.github.io/Pokemon-NFC/pet-app/index.html"
        const val LOCAL_INDEX = "https://appassets.androidplatform.net/assets/www/index.html"
        const val CONTENT_V = 3
        const val LONG_PRESS_MS = 2000L
        const val REQ_LOCATION = 42
    }
}

/**
 * 长按进度圈（原生 View 绘制，跟随 Choreographer 帧回调，
 * 不受 WebView 渲染冻结影响——就算页面完全冻结也能画圈、也能收起）
 */
class PressRingView(context: android.content.Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(242, 255, 255, 255)
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private var baseMs = 0L
    private var progress = 0f
    private var running = false
    private var cx = 0f
    private var cy = 0f
    private var radius = 0f

    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            progress = Math.min(1f, (SystemClock.uptimeMillis() - baseMs) / 2000f)
            invalidate()
            postOnAnimation(this)
        }
    }

    fun setRingMetrics(rect: RectF) {
        cx = rect.centerX()
        cy = rect.centerY()
        radius = Math.max(rect.width(), rect.height()) * 0.55f +
            TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 4f, resources.displayMetrics)
        paint.strokeWidth = Math.max(5f, radius * 0.07f)
        invalidate()
    }

    fun begin() {
        baseMs = SystemClock.uptimeMillis()
        running = true
        removeCallbacks(tick)
        postOnAnimation(tick)
    }

    fun cancel() {
        running = false
        removeCallbacks(tick)
        progress = 0f
        invalidate()
    }

    override fun onDetachedFromWindow() {
        running = false
        removeCallbacks(tick)
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (progress <= 0f || radius <= 0f) return
        // 从正上方开始顺时针画圈
        canvas.drawArc(
            cx - radius, cy - radius, cx + radius, cy + radius,
            -90f, 360f * progress, false, paint
        )
    }
}
