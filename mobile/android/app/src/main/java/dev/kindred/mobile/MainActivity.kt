package dev.kindred.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.UUID

class MainActivity : AppCompatActivity() {
    private lateinit var accounts: Accounts
    private lateinit var downloads: Downloads
    private lateinit var root: LinearLayout
    private lateinit var content: FrameLayout
    private var web: WebView? = null
    private var current: Account? = null
    private var bootstrap: ScriptHandler? = null
    private var fileReply: ValueCallback<Array<Uri>>? = null
    private var microphoneRequest: PermissionRequest? = null
    private var notificationAccount: Account? = null
    private var resumedChat: String? = null
    private var navigationEpoch=0
    private val notificationRouting=kotlinx.coroutines.sync.Mutex()
    private val saveDocument = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri=if(result.resultCode==Activity.RESULT_OK) result.data?.data else null
        // Exports are capped at 32 MB; copy outside the UI thread.
        lifecycleScope.launch(Dispatchers.IO) { downloads.save(uri) }
    }
    private val files = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileReply?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)); fileReply = null
    }
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        val pending = microphoneRequest; microphoneRequest = null
        if (allowed && pending != null && current?.server?.let { ServerAddress.sameOrigin(pending.origin.toString(), it) } == true)
            pending.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else pending?.deny()
    }
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        notificationAccount?.let { if (allowed) enableAlerts(it) else showError("Notifications are off. You can enable them in Android settings.") }; notificationAccount = null
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 16f) = TextView(this).apply { text = value; textSize = size; setPadding(dp(8),dp(10),dp(8),dp(10)) }
    private fun action(title: String, block: () -> Unit) = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
        text = title; isAllCaps = false; minHeight = dp(48); setOnClickListener { block() }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        accounts = Accounts(this)
        downloads = Downloads(this)
        PushRegistration.channel(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val light=(resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window,window.decorView).apply {
            isAppearanceLightStatusBars=light; isAppearanceLightNavigationBars=light
        }
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content = FrameLayout(this)
        val toolbar = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12),0,dp(12),0) }
        toolbar.addView(text("kindred.",20f), LinearLayout.LayoutParams(0,dp(52),1f))
        toolbar.addView(action("Accounts") { showAccounts() })
        root.addView(toolbar); root.addView(content,LinearLayout.LayoutParams(-1,0,1f)); setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val edges = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(edges.left,edges.top,edges.right,edges.bottom); insets
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val browser = web
                if (browser?.parent != null && browser.canGoBack()) browser.goBack()
                else if (browser?.parent != null) showAccounts()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        lifecycleScope.launch {
            WindowInfoTracker.getOrCreate(this@MainActivity).windowLayoutInfo(this@MainActivity).collect { info ->
                // A physical separating hinge is never a touch target. Keep content in one usable segment.
                val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull { it.isSeparating }
                val padding = if (fold == null) 0 else if (fold.orientation == FoldingFeature.Orientation.VERTICAL) (root.width - fold.bounds.left).coerceAtLeast(0) else 0
                content.setPadding(0,0,padding,if(fold?.orientation == FoldingFeature.Orientation.HORIZONTAL) (root.height - fold.bounds.top).coerceAtLeast(0) else 0)
            }
        }
        try {
            if(!routeNotification(intent)) {
                val requested=savedInstanceState?.getString("account") ?: accounts.last
                accounts.find(requested)?.let { open(it) } ?: showAccounts()
            }
        } catch (_: Exception) { showError("Saved accounts could not be opened. Your device's secure storage is unavailable.") }
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent); routeNotification(intent)
    }
    private fun routeNotification(intent: Intent): Boolean {
        val id=intent.getStringExtra("installation_uuid") ?: intent.getStringExtra("account_id") ?: return false
        val account=accounts.find(id) ?: return false
        val chat=intent.getStringExtra("chat_id")?.takeIf { it.matches(Regex("[A-Za-z0-9-]{1,160}")) }
        val profile=intent.getStringExtra("profile_id")?.takeIf { it.matches(Regex("[A-Za-z0-9-]{1,160}")) }
        setIntent(Intent(this,MainActivity::class.java))
        val epoch=++navigationEpoch
        lifecycleScope.launch {
            notificationRouting.withLock {
                try {
                    var target=accounts.find(account.id) ?: return@withLock
                    if(profile!=null && profile!=target.profile && target.token.isNotEmpty()) {
                        val result=withContext(Dispatchers.IO) { ServerApi.request(target.server,"/identity/switch",target.token,"POST",JSONObject().put("profile_id",profile)) }
                        val latest=accounts.find(target.id)
                        if(latest==null) {
                            withContext(Dispatchers.IO) { runCatching { ServerApi.request(target.server,"/identity/logout",result.getString("token"),"POST") } }
                            return@withLock
                        }
                        target=latest.copy(token=result.getString("token"),profile=result.getString("profile_id"))
                        accounts.save(target)
                        if(current?.id==target.id) { destroyWeb(); current=null }
                    }
                    if(epoch==navigationEpoch) { resumedChat=chat; open(target) }
                } catch(e: Exception) {
                    if(epoch==navigationEpoch) showError("Could not open this update. Reconnect or sign in to that account and try again.")
                }
            }
        }
        return true
    }
    override fun onSaveInstanceState(outState: Bundle) { outState.putString("account",current?.id); super.onSaveInstanceState(outState) }
    override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig) /* WebView survives fold/rotation. */ }
    override fun onResume() { super.onResume(); web?.resumeTimers(); web?.onResume(); syncAlerts() }
    override fun onPause() {
        val browser=web; val account=current
        if(browser!=null && account!=null && ServerAddress.sameOrigin(browser.url.orEmpty(),account.server)) {
            browser.evaluateJavascript("window.dispatchEvent(new Event('kindred-mobile-suspend'));JSON.stringify({token:sessionStorage.getItem('kindred-token')||''})") { encoded ->
                if(web===browser && current?.id==account.id && current?.token==account.token) runCatching {
                    val raw=org.json.JSONTokener(encoded).nextValue() as? String ?: return@runCatching
                    val token=JSONObject(raw).getString("token")
                    require(token.length<=8192 && !token.contains('\n'))
                    val latest=accounts.find(account.id) ?: return@runCatching
                    accounts.save(latest.copy(token=token)); current=latest.copy(token=token)
                    updateBootstrap(browser,current!!)
                }
            }
        }
        browser?.onPause(); browser?.pauseTimers(); super.onPause()
    }
    override fun onDestroy() { fileReply?.onReceiveValue(null); microphoneRequest?.deny(); destroyWeb(); super.onDestroy() }
    private fun destroyWeb() { if(::downloads.isInitialized) downloads.cancel(); microphoneRequest?.deny(); microphoneRequest=null; fileReply?.onReceiveValue(null); fileReply=null; if(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) bootstrap?.remove(); bootstrap = null; web?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }; web = null }
    private fun showError(message: String) { MaterialAlertDialogBuilder(this).setTitle("Kindred").setMessage(message).setPositiveButton("OK",null).show() }
    private fun showAccounts() {
        web?.evaluateJavascript("window.dispatchEvent(new Event('kindred-mobile-suspend'))",null)
        (web?.parent as? ViewGroup)?.removeView(web)
        content.removeAllViews()
        val scroll = ScrollView(this)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24),dp(20),dp(24),dp(24)) }
        scroll.addView(list); content.addView(scroll)
        list.addView(text("Accounts",28f))
        val saved = accounts.all()
        if (saved.isEmpty()) list.addView(text("Your bots, wherever you are.\nConnect to your Kindred server.",16f))
        for ((server, entries) in saved.groupBy { it.server }) {
            list.addView(text(Uri.parse(server).authority ?: server,13f))
            for (entry in entries) {
                val row = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
                row.addView(action(entry.username + if(entry.token.isEmpty()) " · Sign in" else "") { open(entry) },LinearLayout.LayoutParams(0,-2,1f))
                row.addView(action("•••") { accountOptions(entry) }.apply { contentDescription = "Options for ${entry.username}" })
                list.addView(row)
            }
        }
        list.addView(action("Add account") { signIn() })
    }
    private fun accountOptions(account: Account) {
        val items = arrayOf(if(account.alerts) "Disable alerts" else "Enable alerts", "Remove account")
        MaterialAlertDialogBuilder(this).setTitle(account.username).setItems(items) { _, which ->
            if(which == 0) {
                if(account.alerts) lifecycleScope.launch {
                    try { withContext(Dispatchers.IO) { PushRegistration.remove(account) }; accounts.save(account.copy(alerts=false)); showAccounts() }
                    catch (_: Exception) { showError("Could not turn off alerts on this server. Reconnect and try again.") }
                } else askAlerts(account)
            } else MaterialAlertDialogBuilder(this).setTitle("Remove ${account.username}?").setMessage("This signs this device out. Your bots and server stay as they are.")
                .setNegativeButton("Cancel",null).setPositiveButton("Remove") { _, _ -> lifecycleScope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            PushRegistration.remove(account)
                            if(account.token.isNotEmpty()) try { ServerApi.request(account.server,"/identity/logout",account.token,"POST") }
                            catch(e: ApiFailure) { if(e.status!=401 && e.status!=403) throw e }
                        }
                        if(current?.id == account.id) { destroyWeb(); current = null }
                        accounts.remove(account.id)
                        if(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) androidx.webkit.ProfileStore.getInstance().deleteProfile(account.id)
                        showAccounts()
                    } catch (_: Exception) { showError("Could not remove this account safely. Reconnect to its server and try again.") }
                } }.show()
        }.show()
    }
    private fun signIn(existing: Account? = null) {
        val form = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(dp(24),dp(8),dp(24),dp(8)) }
        fun field(label: String, initial: String = "", password: Boolean = false): TextInputEditText {
            val layout = TextInputLayout(this).apply { hint=label; boxBackgroundMode=TextInputLayout.BOX_BACKGROUND_OUTLINE }
            val input = TextInputEditText(layout.context).apply { setText(initial); setSingleLine(true); inputType = if(password) 129 else 1; if(password) setAutofillHints(View.AUTOFILL_HINT_PASSWORD) }
            layout.addView(input); form.addView(layout,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(12) }); return input
        }
        val servers = accounts.all().map { it.server }.distinct()
        val server = field("Server address",existing?.server ?: servers.firstOrNull().orEmpty())
        server.inputType = 17
        if(servers.isNotEmpty() && existing == null) form.addView(action("Choose saved server") {
            MaterialAlertDialogBuilder(this).setTitle("Server").setItems((servers + "New server…").toTypedArray()) { _, index -> server.setText(servers.getOrNull(index).orEmpty()); server.requestFocus() }.show()
        },0)
        val username = field("Username",existing?.username.orEmpty()).apply { setAutofillHints(View.AUTOFILL_HINT_USERNAME) }
        val password = field("Password",password=true)
        val status = text("",13f); status.accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE; form.addView(status)
        val dialog = MaterialAlertDialogBuilder(this).setTitle("Sign in").setView(form).setNegativeButton("Cancel",null).setPositiveButton("Sign in",null).create()
        dialog.setOnShowListener { dialog.getButton(-1).setOnClickListener {
            val normalized = try { ServerAddress.normalize(server.text.toString()) } catch(e: Exception) { status.text=e.message; return@setOnClickListener }
            val login = username.text.toString().trim().lowercase()
            if(login.isEmpty() || password.text.isNullOrEmpty()) { status.text="Enter your username and password."; return@setOnClickListener }
            dialog.getButton(-1).isEnabled=false; status.text="Signing in…"
            val secret=password.text.toString()
            lifecycleScope.launch {
                try {
                    val old=accounts.all().find { it.server==normalized && it.username==login }
                    val body=JSONObject().put("login",login).put("password",secret)
                    old?.profile?.takeIf { it.isNotEmpty() }?.let { body.put("profile_id",it) }
                    val response=withContext(Dispatchers.IO) { ServerApi.request(normalized,"/identity/login",method="POST",body=body) }
                    val account=Account(old?.id ?: UUID.randomUUID().toString(),normalized,login,response.getString("token"),response.getString("profile_id"),old?.alerts ?: false)
                    accounts.save(account); password.text?.clear(); dialog.dismiss(); destroyWeb(); current=null; open(account)
                } catch(e: Exception) { status.text=e.message ?: "Couldn't connect. Check the server address and your connection." }
                finally { dialog.getButton(-1).isEnabled=true }
            }
        } }
        dialog.show()
    }
    private fun updateBootstrap(browser: WebView, account: Account) {
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        bootstrap?.remove()
        val script = """if (window.top === window && location.origin === ${JSONObject.quote(account.server)}) {
          window.__KINDRED_MOBILE=true; window.__KINDRED_MOBILE_PLATFORM='android';
          window.__KINDRED_MOBILE_PROFILE=${JSONObject.quote(account.profile)};
          window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
          localStorage.removeItem('kindred-token');
          if (!sessionStorage.getItem('kindred-mobile-ready')) {
            sessionStorage.setItem('kindred-token',${JSONObject.quote(account.token)});
            sessionStorage.setItem('kindred-mobile-ready','1');
          }
        }"""
        bootstrap=WebViewCompat.addDocumentStartJavaScript(browser,script,setOf(account.server))
    }
    private fun open(account: Account) {
        navigationEpoch++
        if(account.token.isEmpty()) { signIn(account); return }
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE) || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            showError("Update Android System WebView in the Play Store to use Kindred's separate accounts."); return
        }
        if(current?.id==account.id && web!=null) {
            content.removeAllViews(); content.addView(web); routeChat(); return
        }
        destroyWeb(); current=account; accounts.last=account.id; content.removeAllViews()
        val browser=WebView(this); web=browser
        WebViewCompat.setProfile(browser,account.id)
        browser.settings.apply {
            javaScriptEnabled=true; domStorageEnabled=true; allowFileAccess=false; allowContentAccess=false
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW; mediaPlaybackRequiresUserGesture=true
            setSupportMultipleWindows(true)
        }
        WebViewCompat.addWebMessageListener(browser,"kindredNative",setOf(account.server)) { _, message, origin, mainFrame, response ->
            if(!mainFrame || !ServerAddress.sameOrigin(origin.toString(),account.server)) return@addWebMessageListener
            val raw=message.data ?: return@addWebMessageListener
            if(raw.length>32000) return@addWebMessageListener
            runCatching {
                val data=JSONObject(raw)
                when(data.optString("type")) {
                    "download-start", "download-chunk", "download-end", "download-cancel" -> {
                        try {
                            downloads.accept(data,{ value -> runOnUiThread { runCatching { response.postMessage(value) } } }) { name ->
                                saveDocument.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                    .setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,name))
                            }
                        } catch(e: Exception) {
                            downloads.cancel()
                            response.postMessage(JSONObject().put("id",data.optString("id")).put("error",e.message ?: "Could not save this file.").toString())
                        }
                    }
                    "accounts" -> showAccounts()
                    "session" -> {
                        val token=data.getString("token"); require(token.length<=8192 && !token.contains('\n'))
                        val latest=accounts.find(account.id) ?: return@runCatching
                        val updated=latest.copy(token=token,profile=data.optString("profile_id",latest.profile).ifEmpty { latest.profile })
                        accounts.save(updated); current=updated; updateBootstrap(browser,updated)
                        if(token.isNotEmpty()) syncAlerts()
                    }
                }
            }
        }
        updateBootstrap(browser,account)
        browser.webViewClient=object: WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if(!request.isForMainFrame) return false
                if(ServerAddress.sameOrigin(request.url.toString(),account.server)) return false
                if(request.hasGesture() && request.url.scheme in listOf("https","http","mailto","tel")) external(request.url)
                return true
            }
            override fun onPageFinished(view: WebView, url: String) { if(ServerAddress.sameOrigin(url,account.server)) routeChat() }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if(request.isForMainFrame) {
                    val retry=action("Connection lost · Retry") { content.removeAllViews(); content.addView(browser); browser.loadUrl(account.server) }
                    content.removeAllViews(); content.addView(retry)
                }
            }
        }
        browser.webChromeClient=object: WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileReply?.onReceiveValue(null); fileReply=callback
                try { files.launch(params.createIntent().apply { addCategory(Intent.CATEGORY_OPENABLE) }) }
                catch(_: Exception) { fileReply?.onReceiveValue(null); fileReply=null }
                return true
            }
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if(!ServerAddress.sameOrigin(request.origin.toString(),account.server) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny(); return@runOnUiThread }
                    microphoneRequest?.deny(); microphoneRequest=request
                    if(ContextCompat.checkSelfPermission(this@MainActivity,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) { request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)); microphoneRequest=null }
                    else microphone.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if(microphoneRequest===request) microphoneRequest=null }
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message): Boolean {
                if(!isUserGesture) return false
                val popup=WebView(this@MainActivity)
                popup.webViewClient=object: WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        if(request.url.scheme in listOf("https","http")) external(request.url)
                        popup.destroy(); return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView=popup; resultMsg.sendToTarget(); return true
            }
        }
        content.addView(browser,FrameLayout.LayoutParams(-1,-1)); browser.loadUrl(account.server)
    }
    private fun external(uri: Uri) { runCatching { startActivity(Intent(Intent.ACTION_VIEW,uri)) }.onFailure { showError("No app can open this link.") } }
    private fun routeChat() {
        val chat=resumedChat ?: return
        if(!chat.matches(Regex("[A-Za-z0-9-]{1,160}"))) { resumedChat=null; return }
        web?.evaluateJavascript("location.hash='kindred-chat='+encodeURIComponent(${JSONObject.quote(chat)})",null); resumedChat=null
    }
    private fun askAlerts(account: Account) {
        if(!BuildConfig.PUSH_CONFIGURED || FirebaseApp.getApps(this).isEmpty()) { showError("Push notifications aren't configured in this preview build yet."); return }
        notificationAccount=account
        if(android.os.Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        else { notificationAccount=null; enableAlerts(account) }
    }
    private fun enableAlerts(account: Account) {
        FirebaseMessaging.getInstance().isAutoInitEnabled=true
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> lifecycleScope.launch {
            try { val enabled=account.copy(alerts=true); withContext(Dispatchers.IO) { PushRegistration.register(this@MainActivity,enabled,token) }; if(accounts.find(account.id)?.token==account.token) accounts.save(enabled); showAccounts() }
            catch(_: Exception) { showError("This server couldn't enable push notifications. Check its mobile push configuration and try again.") }
        } }.addOnFailureListener { showError("Couldn't register this device for notifications. Try again when connected.") }
    }
    private fun syncAlerts() {
        if(!BuildConfig.PUSH_CONFIGURED || FirebaseApp.getApps(this).isEmpty()) return
        if(accounts.all().none { it.alerts }) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> lifecycleScope.launch(Dispatchers.IO) {
            accounts.all().filter { it.alerts }.forEach { runCatching { PushRegistration.register(this@MainActivity,it,token) } }
        } }
    }
}
