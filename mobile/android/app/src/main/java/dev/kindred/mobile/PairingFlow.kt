package dev.kindred.mobile

import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Native pairing UI: parse a scanned or pasted link, confirm its server, claim once, then hand the saved account
 * back to MainActivity. The code is sent only after **Connect**; failures are shown, never retried automatically. */
class PairingFlow(
    private val activity: AppCompatActivity,
    private val accounts: Accounts,
    private val scan: () -> Unit,
    private val signInWithPassword: (server: String?) -> Unit,
    private val opened: (Account) -> Unit,
    private val client: PairingClient = PairingClient(),
) {
    private var busy = false
    private var shown: AlertDialog? = null
    private var confirming: PairingLink? = null
    private val accent get() = ContextCompat.getColor(activity, R.color.kindred_accent)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 15f, secondary: Boolean = false) = TextView(activity).apply {
        text = value; textSize = size; setPadding(0, dp(6), 0, dp(6))
        if (secondary) alpha = 0.75f
    }
    private fun column() = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(12), dp(24), dp(4)) }

    /** Raw text from the scanner, a pasted link or a `kindred://pair` intent. */
    fun start(raw: String) {
        if (busy) { info("Finish the current pairing before opening another code."); return }
        val link = try { PairingLink.parse(raw) } catch (e: PairingLinkError) {
            failure(null, e.kind.let { if (it == PairingLinkError.Kind.LOOPBACK_SERVER) "This code can't reach your phone" else "This pairing code can't be used" },
                e.message.orEmpty(), help = e.kind == PairingLinkError.Kind.LOOPBACK_SERVER)
            return
        }
        confirm(link)
    }

    fun paste() {
        val form = column()
        val layout = TextInputLayout(activity).apply { hint = "kindred://pair?…"; boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE }
        val input = TextInputEditText(layout.context).apply { minLines = 2; maxLines = 5; inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE; typeface = Typeface.MONOSPACE }
        layout.addView(input); form.addView(layout)
        form.addView(MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Paste from clipboard"; isAllCaps = false
            // Read the clipboard only on this explicit tap.
            setOnClickListener {
                val clip = (activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
                clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(activity)?.let { input.setText(it.toString().take(PairingLink.MAX_LENGTH + 64)) }
            }
        })
        val status = text("", 13f).apply { setTextColor(0xFFB3261E.toInt()); accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        form.addView(status)
        val dialog = MaterialAlertDialogBuilder(activity).setTitle("Paste pairing link").setView(form)
            .setNegativeButton("Cancel", null).setPositiveButton("Continue", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try { val link = PairingLink.parse(input.text.toString()); input.text?.clear(); confirm(link) }
            catch (e: PairingLinkError) { status.text = e.message }
        } }
        present(dialog)
    }

    private fun confirm(link: PairingLink) {
        // A repeated deep link for the same code keeps the dialog already showing.
        if (confirming == link && shown?.isShowing == true) return
        val view = column()
        view.addView(text("Connect to this server?", 20f).apply { setTypeface(typeface, Typeface.BOLD) })
        view.addView(TextView(activity).apply {
            text = link.displayName; textSize = 18f; typeface = Typeface.MONOSPACE; gravity = Gravity.CENTER
            setTextIsSelectable(true); setPadding(dp(14), dp(12), dp(14), dp(12)); contentDescription = "Server ${link.displayName}"
            background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor((accent and 0x00FFFFFF) or 0x22000000) }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8); bottomMargin = dp(8) })
        view.addView(text("Make sure this matches the address on your computer.", 14f, true))
        present(MaterialAlertDialogBuilder(activity).setView(view)
            .setPositiveButton("Connect") { _, _ -> connect(link) }
            .setNegativeButton("Cancel", null).create(), link)
    }

    /** Only one pairing dialog at a time: a newer link or result replaces the one showing. */
    private fun present(dialog: AlertDialog, link: PairingLink? = null) {
        shown?.takeIf { it !== dialog }?.dismiss()
        shown = dialog; confirming = link
        dialog.setOnDismissListener { if (shown === dialog) { shown = null; confirming = null } }
        dialog.show()
    }

    private fun connect(link: PairingLink) {
        if (busy) return
        busy = true
        val progress = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(24), dp(20), dp(24), dp(20)) }
        progress.addView(ProgressBar(activity))
        progress.addView(text("Connecting to ${link.displayName}…").apply { setPadding(dp(16), 0, 0, 0) })
        val waiting = MaterialAlertDialogBuilder(activity).setView(progress).setCancelable(false).create()
        present(waiting)
        activity.lifecycleScope.launch {
            try {
                val session = withContext(Dispatchers.IO) { client.claim(link) }
                val adopted = try {
                    withContext(Dispatchers.IO) {
                        PairingAccounts.adopt(accounts.all(), session).also { accounts.save(it.account) }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.IO) { client.logout(session.server, session.token) }
                    throw PairingError.Server("Kindred couldn't save this sign-in securely on this device.")
                }
                // End the replaced session only after the new one is saved.
                adopted.replacedToken?.let { old -> withContext(Dispatchers.IO) { client.logout(session.server, old) } }
                waiting.dismiss(); busy = false
                opened(adopted.account)
                info("Connected ${adopted.account.username} on ${link.displayName}.")
            } catch (e: PairingError) {
                waiting.dismiss(); busy = false
                failure(link, e.title, e.message.orEmpty(), help = e.showsConnectionHelp,
                    detail = (e as? PairingError.Unreachable)?.detail ?: (e as? PairingError.ClaimUnconfirmed)?.detail, retry = e.allowsManualRetry, password = e is PairingError.Unsupported)
            } catch (e: Exception) {
                waiting.dismiss(); busy = false
                failure(link, "Couldn't add the account", "Something went wrong while pairing. Nothing was saved.")
            }
        }
    }

    private fun failure(link: PairingLink?, title: String, message: String, help: Boolean = false, detail: String? = null,
                        retry: Boolean = false, password: Boolean = false) {
        val view = column()
        view.addView(text(title, 20f).apply { setTypeface(typeface, Typeface.BOLD) })
        link?.let { view.addView(text(it.displayName, 14f, true).apply { typeface = Typeface.MONOSPACE }) }
        view.addView(text(message))
        if (help) {
            val steps = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE; setPadding(dp(4), dp(4), 0, dp(4)) }
            PairingError.CONNECTION_CHECKLIST.forEachIndexed { i, step -> steps.addView(text("${i + 1}. $step", 14f)) }
            detail?.let { steps.addView(text(it, 13f, secondary = true)) }
            val toggle = TextView(activity).apply {
                text = "Help  ▾"; textSize = 15f; setTextColor(accent); setTypeface(typeface, Typeface.BOLD)
                minHeight = dp(48); gravity = Gravity.CENTER_VERTICAL; isClickable = true; isFocusable = true
                contentDescription = "Help, collapsed"
                setOnClickListener {
                    val open = steps.visibility != View.VISIBLE
                    steps.visibility = if (open) View.VISIBLE else View.GONE
                    text = if (open) "Help  ▴" else "Help  ▾"
                    contentDescription = if (open) "Help, expanded" else "Help, collapsed"
                }
            }
            view.addView(toggle); view.addView(steps)
        }
        val builder = MaterialAlertDialogBuilder(activity).setView(view).setNegativeButton("Close", null)
        if (retry && link != null) builder.setPositiveButton("Try again") { _, _ -> connect(link) }.setNeutralButton("Scan again") { _, _ -> scan() }
        else if (password) builder.setPositiveButton("Sign in with password") { _, _ -> signInWithPassword(link?.server) }
        else builder.setPositiveButton(if (link == null) "Scan again" else "Scan a new code") { _, _ -> scan() }
        present(builder.create())
    }

    private fun info(message: String) { android.widget.Toast.makeText(activity, message, android.widget.Toast.LENGTH_SHORT).show() }
}
