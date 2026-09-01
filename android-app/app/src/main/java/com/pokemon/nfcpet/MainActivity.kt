package com.pokemon.nfcpet

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.webkit.JavascriptInterface
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
 * - 悬浮宠物窗口：透明 WebView（TYPE_APPLICATION_OVERLAY），加载 overlay 模式 H5
 *   （?native=1&overlay=1&buddy=xxx），宠物像真的站在屏幕上
 * - NFC：前台调度 + NDEF 意图读取手环 → JS 桥接唤醒 → H5 走 summon 流程
 */
class MainActivity : Activity() {

    private lateinit var mainWebView: WebView
    private var overlayWebView: WebView? = null
    private var currentBuddy: String? = null
    private var nfcAdapter: NfcAdapter? = null
    private var pageLoaded = false
    private var pendingBuddy: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        mainWebView = buildWebView()
        mainWebView.addJavascriptInterface(PetBridge(), "PetBridge")
        setContentView(mainWebView)
        mainWebView.loadUrl("$INDEX?native=1")

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        handleNfcIntent(intent)
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
        // 从系统设置页开完权限回来，自动补召唤
        val buddy = currentBuddy
        if (buddy != null && Settings.canDrawOverlays(this) && overlayWebView == null) {
            createOverlay(buddy)
        }
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    /* ─── WebView 工厂 ─── */

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
        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

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

        @JavascriptInterface
        fun pet() = runOnUiThread { sendToOverlay("window.__petHappy && window.__petHappy()") }

        @JavascriptInterface
        fun wave() = runOnUiThread { sendToOverlay("window.__petWave && window.__petWave()") }

        @JavascriptInterface
        fun dismiss() = runOnUiThread { removeOverlay() }
    }

    /* ─── 悬浮宠物窗口 ─── */

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
            wv.setBackgroundColor(Color.TRANSPARENT)
            val lp = WindowManager.LayoutParams(
                dp(300), dp(360),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            )
            lp.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            lp.y = dp(20)
            windowManager.addView(wv, lp)
            overlayWebView = wv
        }
        overlayWebView?.loadUrl("$INDEX?native=1&overlay=1&buddy=$buddy")
    }

    private fun sendToOverlay(js: String) {
        overlayWebView?.post {
            overlayWebView?.evaluateJavascript(js, null)
        }
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
        const val INDEX = "https://appassets.androidplatform.net/assets/www/index.html"
    }
}
