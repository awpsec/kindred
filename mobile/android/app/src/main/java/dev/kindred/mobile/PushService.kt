package dev.kindred.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

object PushRegistration {
    fun register(context: Context, account: Account, token: String) {
        if (!account.alerts || account.token.isEmpty() || token.isEmpty()) return
        val identity=ServerApi.request(account.server,"/identity/profiles",account.token)
        val owner=identity.getString("account_id")
        val result=ServerApi.request(account.server, "/api/mobile/devices/${account.id}", account.token, "PUT",
            JSONObject().put("platform", "android").put("token", token).put("environment", "production").put("account_id", owner))
        check(result.optBoolean("delivery_enabled")) { "This server has not configured Android push delivery." }
    }
    fun remove(account: Account) {
        if (!account.alerts || account.token.isEmpty()) return
        try { ServerApi.request(account.server, "/api/mobile/devices/${account.id}", account.token, "DELETE") }
        catch(e: ApiFailure) { if(e.status != 401 && e.status != 403) throw e }
    }
    fun channel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel("kindred_updates", "Bot updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When your bots finish or need you"
                enableVibration(false)
                setSound(android.net.Uri.parse("android.resource://${context.packageName}/raw/kindred_pop"),
                    android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            })
    }
}
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Retried when the app resumes as well; an offline backend must not lose the refreshed token.
        runCatching { Accounts(this).all() }.getOrDefault(emptyList()).filter { it.alerts }.forEach { account ->
            runCatching { PushRegistration.register(this, account, token) }
        }
    }
    override fun onMessageReceived(message: RemoteMessage) {
        val account = runCatching { Accounts(this).find(message.data["installation_uuid"]) }.getOrNull() ?: return
        if (!account.alerts) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val chat = message.data["chat_id"] ?: return
        if (!chat.matches(Regex("[A-Za-z0-9-]{1,160}"))) return
        val event = message.data["event_id"] ?: message.messageId ?: return
        val intent = Intent(this, MainActivity::class.java).setAction("dev.kindred.UPDATE.${account.id}.$event")
            .putExtra("account_id", account.id).putExtra("chat_id", chat).putExtra("profile_id",message.data["profile_id"])
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        PushRegistration.channel(this)
        val title = message.notification?.title?.take(160) ?: "Kindred"
        val body = message.notification?.body?.take(1200) ?: "Your bots have an update for you."
        val notification = NotificationCompat.Builder(this, "kindred_updates")
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title)
            .setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
        NotificationManagerCompat.from(this).notify("${account.id}:$event", 1, notification)
    }
}
