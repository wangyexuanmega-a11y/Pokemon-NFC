package com.pokemon.nfcpet

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * 宝可梦 NFC 宠物 —— 原生壳
 *
 * - WebView 加载 assets/www 里的 H5（pet-app），负责皮卡丘渲染与动画
 * - 原生代码通过 NFC 前台调度 + NDEF 意图读取手环标签
 * - 读到 buddy id 后调用页面里的 window.__petNfc(id) 弹宠物
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var nfcAdapter: NfcAdapter? = null
    private var pageLoaded = false
    private var pendingBuddy: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 演示时保持屏幕常亮
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)

        // 用 WebViewAssetLoader 提供 https 域名的本地资源，ES Module 才能正常加载
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String?) {
                pageLoaded = true
                pendingBuddy?.let {
                    deliverBuddy(it)
                    pendingBuddy = null
                }
            }
        }

        // ?native=1 告诉页面：运行在原生 App 里，跳过 Web NFC，改由原生桥接驱动
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html?native=1")

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        handleNfcIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val adapter = nfcAdapter ?: return
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_MUTABLE
        )
        // 前台调度：App 打开时直接拦截 NFC 标签（URL 记录 + 文本记录）
        val filters = arrayOf(
            IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataType("text/plain") },
            IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataScheme("http") },
            IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply { addDataScheme("https") }
        )
        adapter.enableForegroundDispatch(this, pendingIntent, filters, null)
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent) {
        if (intent.action != NfcAdapter.ACTION_NDEF_DISCOVERED) return
        val buddy = parseBuddy(intent) ?: return
        // 页面没加载完就先存着，onPageFinished 时再补发
        if (pageLoaded) deliverBuddy(buddy) else pendingBuddy = buddy
    }

    /** 把 buddy id 注入页面：window.__petNfc('pikachu') */
    private fun deliverBuddy(buddy: String) {
        val safe = buddy.replace("'", "").replace("\"", "")
        webView.post {
            webView.evaluateJavascript("window.__petNfc && window.__petNfc('$safe')", null)
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
                        val uri = NdefRecord.createUri(record) ?: continue
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
}
