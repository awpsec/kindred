package dev.kindred.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

 data class Account(val id: String, val server: String, val username: String, val token: String, val profile: String, val alerts: Boolean = false) {
    fun json() = JSONObject().put("id", id).put("server", server).put("username", username).put("token", token).put("profile", profile).put("alerts", alerts)
    companion object {
        fun read(v: JSONObject) = Account(v.getString("id"), ServerAddress.normalize(v.getString("server")), v.getString("username"), v.getString("token"), v.getString("profile"), v.optBoolean("alerts"))
    }
}

/** All persisted session material is AES-GCM encrypted with a non-exportable Android Keystore key.
 * Backups are disabled: copied ciphertext cannot be restored without its device key. */
class Accounts(context: Context) {
    private val prefs = context.getSharedPreferences("kindred.accounts", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("kindred.accounts.v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("kindred.accounts.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun all(): List<Account> = synchronized(lock) {
        val saved = prefs.getString("vault", null) ?: return@synchronized emptyList()
        val data = Base64.decode(saved, Base64.NO_WRAP)
        require(data.size > 28) { "Saved accounts could not be opened." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
        val array = JSONArray(String(cipher.doFinal(data.copyOfRange(12, data.size)), Charsets.UTF_8))
        (0 until array.length()).map { Account.read(array.getJSONObject(it)) }
    }
    private fun write(accounts: List<Account>) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encoded = Base64.encodeToString(cipher.iv + cipher.doFinal(JSONArray(accounts.map { it.json() }).toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(prefs.edit().putString("vault", encoded).commit()) { "Could not save accounts on this device." }
    }
    fun save(account: Account) = synchronized(lock) { write(all().filter { it.id != account.id } + account) }
    fun remove(id: String) = synchronized(lock) { write(all().filter { it.id != id }) }
    fun find(id: String?): Account? = all().find { it.id == id }
    var last: String?
        get() = prefs.getString("last", null)
        set(value) { prefs.edit().putString("last", value).apply() }
    companion object { private val lock = Any() }
}
