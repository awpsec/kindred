package dev.kindred.mobile

import java.net.URI
import java.util.Locale

/** An account is pinned to one HTTPS origin. Never send credentials across redirects. */
object ServerAddress {
    fun normalize(input: String): String {
        val value = input.trim()
        require(value.isNotEmpty() && value.length <= 2048) { "Enter your server address." }
        val uri = try { URI(if (value.contains("://")) value else "https://$value") }
            catch (_: Exception) { throw IllegalArgumentException("Enter a valid server address.") }
        require(uri.scheme.equals("https", true) && !uri.host.isNullOrEmpty() && uri.rawUserInfo == null &&
            uri.rawQuery == null && uri.rawFragment == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") &&
            (uri.port == -1 || uri.port in 1..65535)) { "Use an HTTPS server address without a path or sign-in details." }
        return URI("https", null, uri.host.lowercase(Locale.ROOT), if (uri.port == 443) -1 else uri.port, null, null, null).toASCIIString()
    }
    fun sameOrigin(url: String, server: String): Boolean = try {
        val uri = URI(url)
        normalize(URI(uri.scheme, uri.rawAuthority, null, null, null).toString()) == server
    } catch (_: Exception) { false }
}
