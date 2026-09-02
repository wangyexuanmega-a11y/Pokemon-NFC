package com.pokemon.nfcpet

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Bundle
import android.os.SystemClock
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
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * 宝可梦 NFC 宠物 —— 原生壳
 *
 * - 主界面 WebView：宝可梦选择界面（H5，?native=1）
 * - 内容优先从 GitHub Pages 在线加载（改内容不用重新装 APK），失败时回退到内置资源
 * - 悬浮宠物窗口：透明 WebView（TYPE_APPLICATION_OVERLAY）+ 可拖拽
 * - NFC：前台调度 + NDEF 意图读取手环 → JS 桥接唤醒 → H5 走 summon 流程
 */
class MainActivity : Activity() {

    private lateinit var mainWebView: WebView
    private var overlayWebView: WebView? = null
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
    private var touchOnPet = false // 触摸点是否在宝可梦本体上（拖拽门控）

    // 步数（硬件计步传感器，为进化系统积累数据）
    private var sensorManager: SensorManager? = null
    private var stepCounter: Sensor? = null
    private var lastSensorSteps = 0f
    private var lastPushMs = 0L
    private var lastPushedTotal = -1L
    private val prefs by lazy { getSharedPreferences("pet_steps", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        mainWebView = buildWebView()
        mainWebView.addJavascriptInterface(PetBridge(), "PetBridge")
        setContentView(mainWebView)
        mainWebView.loadUrl("$REMOTE_INDEX?native=1")

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
        if (buddy != null && Settings.canDrawOverlays(this) && overlayWebView == null) {
            createOverlay(buddy)
        }
        // App 前台：隐藏悬浮宠物（由初始界面平台展示）
        overlayWebView?.visibility = View.GONE
    }

    override fun onStop() {
        super.onStop()
        // 回桌面：重新显示悬浮宠物
        overlayWebView?.visibility = View.VISIBLE
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
            return if (q.isNullOrEmpty()) "$LOCAL_INDEX?native=1" else "$LOCAL_INDEX?$q"
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

    /* ─── JS → 原生桥接（主界面 H5 调用） ─── */

    inner class PetBridge {
        @JavascriptInterface
        fun summon(buddy: String) = runOnUiThread { summonOverlay(buddy) }

        /** 只刷新悬浮窗素材（宠物已在场时用，不重新召唤、不弹权限） */
        @JavascriptInterface
        fun reloadOverlay() = runOnUiThread {
            val buddy = currentBuddy
            val wv = overlayWebView
            if (buddy != null && wv != null) {
                wv.loadUrl("$REMOTE_INDEX?native=1&overlay=1&buddy=$buddy")
            }
        }

        /** 宠物实际像素范围 → 原生把悬浮窗缩到刚好包住宠物（缩小触摸影响区） */
        @JavascriptInterface
        fun setPetBounds(left: Int, top: Int, width: Int, height: Int) = runOnUiThread {
            val wv = overlayWebView ?: return@runOnUiThread
            val lp = wv.layoutParams as? WindowManager.LayoutParams ?: return@runOnUiThread
            if (width <= 0 || height <= 0) return@runOnUiThread
            lp.x += left
            lp.y += top
            lp.width = width
            lp.height = height
            try {
                windowManager.updateViewLayout(wv, lp)
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun dismiss() = runOnUiThread { removeOverlay() }

        /** 累计步数（进化系统用） */
        @JavascriptInterface
        fun getTotalSteps(): Long = prefs.getLong("total", 0L)

        /** 触摸点是否在宝可梦本体上（拖拽只在本体生效） */
        @JavascriptInterface
        fun setTouchOnPet(on: Boolean) = runOnUiThread { touchOnPet = on }

        /** 初始界面右上角关闭：退出 App */
        @JavascriptInterface
        fun exit() = runOnUiThread {
            removeOverlay()
            finish()
        }
    }

    /* ─── 步数统计 ───
     * 硬件计步器（SENSOR_STEP_COUNTER）开机后持续累计，App 每次打开读取增量；
     * 步数持久化在 SharedPreferences，供进化系统兑换经验。
     */
    private fun initStepCounter() {
        if (sensorManager == null) {
            sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
            stepCounter = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            lastSensorSteps = prefs.getFloat("last", 0f)
        }
    }

    private val stepListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
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
            // 推送页面（限频：最多每秒一次）
            val now = SystemClock.elapsedRealtime()
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

    /* ─── 悬浮宠物窗口（可拖拽） ─── */

    private fun summonOverlay(buddy: String) {
        currentBuddy = buddy
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "请允许「显示在其他应用上层」权限后再次召唤", Toast.LENGTH_LONG).show()
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            )
            return
        }
        createOverlay(buddy)
    }

    private fun createOverlay(buddy: String) {
        if (overlayWebView == null) {
            val wv = buildWebView()
            wv.addJavascriptInterface(PetBridge(), "PetBridge")
            wv.setBackgroundColor(Color.TRANSPARENT)
            val winW = dp(240)
            val winH = dp(280)
            val metrics = resources.displayMetrics
            val lp = WindowManager.LayoutParams(
                winW, winH,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            )
            // 初始位置：屏幕底部居中；之后用户可拖拽（TOP|START 坐标模式）
            lp.gravity = Gravity.TOP or Gravity.START
            lp.x = (metrics.widthPixels - winW) / 2
            lp.y = metrics.heightPixels - winH - dp(30)
            windowManager.addView(wv, lp)

            // 拖拽：超过触摸阈值后移动窗口，否则把事件留给页面（点宠物等）
            val slop = ViewConfiguration.get(this).scaledTouchSlop
            wv.setOnTouchListener { v, ev ->
                val oLp = v.layoutParams as WindowManager.LayoutParams
                when (ev.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        dragX = ev.rawX
                        dragY = ev.rawY
                        startLx = oLp.x
                        startLy = oLp.y
                        dragging = false
                        touchOnPet = false // 由页面 pointerdown 判断后设置
                        false
                    }
                    MotionEvent.ACTION_MOVE -> {
                        // 拖拽只在宝可梦本体上生效
                        if (!touchOnPet) {
                            false
                        } else {
                            val dx = ev.rawX - dragX
                            val dy = ev.rawY - dragY
                            if (!dragging && Math.abs(dx) < slop && Math.abs(dy) < slop) {
                                false
                            } else {
                                dragging = true
                                oLp.x = startLx + dx.toInt()
                                oLp.y = startLy + dy.toInt()
                                try {
                                    windowManager.updateViewLayout(v, oLp)
                                } catch (_: Exception) {
                                }
                                true
                            }
                        }
                    }
                    else -> {
                        val wasDragging = dragging
                        dragging = false
                        wasDragging
                    }
                }
            }

            overlayWebView = wv
        }
        overlayWebView?.loadUrl("$REMOTE_INDEX?native=1&overlay=1&buddy=$buddy")
    }

    private fun removeOverlay() {
        overlayWebView?.let { wv ->
            if (wv.parent != null) {
                try {
                    windowManager.removeView(wv)
                } catch (_: Exception) {
                }
            }
            overlayWebView = null
            currentBuddy = null
        }
    }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

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
        // 内容在线地址（改 pet-app 推 GitHub 即自动更新，无需重装 APK）
        const val REMOTE_INDEX = "https://wangyexuanmega-a11y.github.io/Pokemon-NFC/pet-app/index.html"
        // 内置资源兜底
        const val LOCAL_INDEX = "https://appassets.androidplatform.net/assets/www/index.html"
    }
}
