package dev.kindred.mobile

import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.util.Locale
import java.util.UUID
import javax.net.ssl.SSLException

/** `kindred://pair?server=<percent-encoded HTTPS origin>#code=<64 hex>`, issued by Kindred on a computer.
 * Parsing never contacts the server: the person confirms [server] before [code] is sent anywhere. */
class PairingLink private constructor(val server: String, val code: String) {
    /** The code is a one-time credential; keep it out of every string form. */
    override fun toString() = "kindred://pair?server=$server#code=<redacted>"
    override fun equals(other: Any?) = other is PairingLink && other.server == server && other.code == code
    override fun hashCode() = server.hashCode() * 31 + code.hashCode()
    val displayName: String get() = server.removePrefix("https://")

    companion object {
        const val MAX_LENGTH = 2048
        private val HEX64 = Regex("[0-9A-Fa-f]{64}")

        fun parse(raw: String): PairingLink {
            val input = raw.trim()
            if (input.isEmpty()) throw PairingLinkError(PairingLinkError.Kind.EMPTY)
            if (input.length > MAX_LENGTH || input.any { it.code <= 0x20 || it.code >= 0x7F }) throw PairingLinkError(PairingLinkError.Kind.NOT_PAIRING_LINK)
            val uri = try { URI(input) } catch (_: Exception) { throw PairingLinkError(PairingLinkError.Kind.NOT_PAIRING_LINK) }
            if (!uri.scheme.equals("kindred", true) || uri.rawAuthority?.equals("pair", true) != true ||
                !(uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) throw PairingLinkError(PairingLinkError.Kind.NOT_PAIRING_LINK)

            val items = uri.rawQuery?.split('&').orEmpty()
            if (items.any { it.substringBefore('=') == "code" }) throw PairingLinkError(PairingLinkError.Kind.INVALID_CODE)
            if (items.size != 1 || !items[0].startsWith("server=")) throw PairingLinkError(PairingLinkError.Kind.INVALID_SERVER)
            val value = percentDecode(items[0].removePrefix("server=")) ?: throw PairingLinkError(PairingLinkError.Kind.INVALID_SERVER)
            // Manual entry may omit the scheme; a pairing link must name HTTPS explicitly.
            val lowered = value.lowercase(Locale.ROOT)
            if (lowered.startsWith("http://")) throw PairingLinkError(PairingLinkError.Kind.INSECURE_SERVER)
            if (!lowered.startsWith("https://")) throw PairingLinkError(PairingLinkError.Kind.INVALID_SERVER)
            val server = try { ServerAddress.normalize(value) } catch (_: Exception) { throw PairingLinkError(PairingLinkError.Kind.INVALID_SERVER) }
            val host = URI(server).host.orEmpty().removePrefix("[").removeSuffix("]")
            when (HostClass.of(host)) {
                HostClass.LOOPBACK -> throw PairingLinkError(PairingLinkError.Kind.LOOPBACK_SERVER)
                HostClass.AMBIGUOUS -> throw PairingLinkError(PairingLinkError.Kind.INVALID_SERVER)
                HostClass.ROUTABLE -> Unit
            }

            val fragment = uri.rawFragment ?: throw PairingLinkError(PairingLinkError.Kind.INVALID_CODE)
            val code = fragment.removePrefix("code=")
            if (!fragment.startsWith("code=") || !HEX64.matches(code)) throw PairingLinkError(PairingLinkError.Kind.INVALID_CODE)
            return PairingLink(server, code.lowercase(Locale.ROOT))
        }

        /** Shaped like a Kindred link: a scanner can tell "someone else's QR code" from "a broken Kindred code". */
        fun looksLikePairingLink(raw: String) = raw.trim().lowercase(Locale.ROOT).startsWith("kindred://pair")

        /** Strict RFC 3986 decoding: `+` stays `+`, malformed escapes and non-ASCII results fail. */
        internal fun percentDecode(value: String): String? {
            val out = StringBuilder()
            var i = 0
            while (i < value.length) {
                val c = value[i]
                if (c == '%') {
                    if (i + 2 >= value.length) return null
                    val decoded = value.substring(i + 1, i + 3).toIntOrNull(16) ?: return null
                    if (decoded <= 0x20 || decoded >= 0x7F) return null
                    out.append(decoded.toChar()); i += 3
                } else { out.append(c); i++ }
            }
            return out.toString()
        }
    }
}

class PairingLinkError(val kind: Kind) : IllegalArgumentException(kind.message) {
    enum class Kind(val message: String) {
        EMPTY("Paste the pairing link from Kindred on your computer."),
        NOT_PAIRING_LINK("That isn't a Kindred pairing code."),
        INVALID_SERVER("This pairing code doesn't contain a usable server address."),
        INSECURE_SERVER("This pairing code uses an unencrypted address. Kindred connects over HTTPS only."),
        LOOPBACK_SERVER("This code points to localhost, which a phone can't reach. Create it with the computer's HTTPS address instead."),
        INVALID_CODE("This pairing code is incomplete. Create a new code on your computer and scan it again."),
    }
}

/** Canonical host (lowercase, IPv6 without brackets). */
enum class HostClass {
    ROUTABLE,
    /** Loopback or unspecified: on a phone this is the phone itself. */
    LOOPBACK,
    /** Numeric forms resolvers read differently (`127.1`, `0x7f.0.0.1`, `2130706433`). */
    AMBIGUOUS;

    companion object {
        fun of(host: String): HostClass {
            if (host == "localhost" || host.endsWith(".localhost")) return LOOPBACK
            if (host.contains(':')) {
                val b = ipv6Bytes(host) ?: return AMBIGUOUS
                if ((0 until 15).all { b[it] == 0 } && (b[15] == 0 || b[15] == 1)) return LOOPBACK
                if ((0 until 10).all { b[it] == 0 } && ((b[10] == 0xFF && b[11] == 0xFF) || (b[10] == 0 && b[11] == 0)))
                    return ipv4(listOf(b[12], b[13], b[14], b[15]))
                return ROUTABLE
            }
            val labels = host.split('.')
            val numeric = labels.all { it.isNotEmpty() && (it.all(::digit) || it.startsWith("0x")) }
            if (!numeric) return ROUTABLE
            val octets = labels.mapNotNull { if (it.all(::digit) && (it == "0" || !it.startsWith("0")) && it.length <= 3) it.toInt().takeIf { v -> v <= 255 } else null }
            if (labels.size != 4 || octets.size != 4) return AMBIGUOUS
            return ipv4(octets)
        }
        private fun ipv4(o: List<Int>) = if (o[0] == 127 || o.all { it == 0 }) LOOPBACK else ROUTABLE
        private fun digit(c: Char) = c in '0'..'9'

        /** RFC 4291 text form, including `::` and a trailing dotted IPv4. Returns 16 unsigned bytes. */
        internal fun ipv6Bytes(text: String): IntArray? {
            if (text.contains('%') || text.split("::").size > 2) return null
            fun groups(part: String, allowV4: Boolean): List<Int>? {
                if (part.isEmpty()) return emptyList()
                val out = mutableListOf<Int>()
                val pieces = part.split(':')
                pieces.forEachIndexed { index, piece ->
                    if (allowV4 && index == pieces.lastIndex && piece.contains('.')) {
                        val o = piece.split('.')
                        if (o.size != 4 || o.any { it.isEmpty() || it.length > 3 || !it.all(::digit) || it.toInt() > 255 }) return null
                        out += o[0].toInt() shl 8 or o[1].toInt(); out += o[2].toInt() shl 8 or o[3].toInt()
                    } else {
                        if (piece.length !in 1..4) return null
                        out += piece.toIntOrNull(16) ?: return null
                    }
                }
                return out
            }
            val halves = text.split("::")
            val words = if (halves.size == 2) {
                val head = groups(halves[0], false) ?: return null
                val tail = groups(halves[1], true) ?: return null
                if (head.size + tail.size > 7) return null
                head + List(8 - head.size - tail.size) { 0 } + tail
            } else (groups(text, true) ?: return null).takeIf { it.size == 8 } ?: return null
            return words.flatMap { listOf(it shr 8, it and 0xFF) }.toIntArray()
        }
    }
}

/** Why pairing stopped. Nothing is retried automatically. */
sealed class PairingError(message: String) : Exception(message) {
    open val title = "Couldn't add the account"
    /** Show the expandable connection checklist. */
    open val showsConnectionHelp = false
    /** The request may never have reached the server; the person may choose to repeat it. */
    open val allowsManualRetry = false

    /** No response before the code was sent; the code is unspent. */
    class Unreachable(val detail: String) : PairingError("Your phone couldn't reach this server.") {
        override val title = "Could not connect to server"; override val showsConnectionHelp = true; override val allowsManualRetry = true
    }
    /** The connection failed after the code was sent. It may be spent, so the same code is never offered again. */
    class ClaimUnconfirmed(val detail: String) : PairingError("The connection dropped after the code was sent, so it may already be used. Create a new code and scan it.") {
        override val title = "Pairing wasn't confirmed"; override val showsConnectionHelp = true
    }
    object NotKindredServer : PairingError("That address didn't answer like a Kindred server, so the pairing code wasn't sent.")
    object Redirected : PairingError("The server tried to redirect the request, so Kindred stopped. Pairing works only with the server's final HTTPS address.")
    object CodeRejected : PairingError("It's invalid, expired or already used. Create a new code in Kindred on your computer, then scan it.") {
        override val title = "This pairing code can't be used"
    }
    object Unsupported : PairingError("This server doesn't support phone pairing yet. Update Kindred on the server, or sign in with your username and password.") {
        override val title = "Pairing isn't available on this server"
    }
    object RateLimited : PairingError("Too many pairing attempts. Wait a minute, then create a new code.")
    class Server(message: String) : PairingError(message)
    object InvalidResponse : PairingError("The server sent a pairing response Kindred couldn't use. Nothing was saved.")
    object AccountMismatch : PairingError("The server's session didn't match the account in the code. Nothing was saved.")

    companion object {
        val CONNECTION_CHECKLIST = listOf(
            "Kindred is running and the computer is awake.",
            "For direct network access, Server admin › Network listens on All interfaces.",
            "This HTTPS address is trusted and listed in Server admin › Network › Connection addresses.",
            "Your phone is on the same network, or its VPN (such as Tailscale) is on.",
        )

        /** After the code is sent, a lost connection leaves its outcome unknown. */
        fun afterCodeSent(e: IOException) = ClaimUnconfirmed(transport(e).detail)

        fun transport(e: IOException) = Unreachable(when (e) {
            is SSLException -> "The server's HTTPS certificate couldn't be verified, so Kindred didn't connect."
            is java.net.UnknownHostException -> "Kindred couldn't find that server."
            is java.net.SocketTimeoutException, is java.io.InterruptedIOException -> "The server didn't respond in time."
            is java.net.ConnectException -> "The server refused the connection."
            else -> "The connection failed."
        })

        /** Status mapping for `POST /identity/mobile-pairing/claim`. */
        fun claimStatus(e: ApiFailure): PairingError = when (e.status) {
            in 300..399 -> Redirected
            400, 401, 403, 409, 410, 422 -> CodeRejected
            // A missing route has no Kindred error body; a rejected code does.
            404 -> if (e.fromServer) CodeRejected else Unsupported
            429 -> RateLimited
            else -> Server(if (e.fromServer) e.message.orEmpty().take(300) else "The server returned an error (${e.status}).")
        }
    }
}

/** A claimed session whose identity matched the code. */
class PairedSession(val server: String, val token: String, val profile: String, val accountId: String, val login: String) {
    override fun toString() = "PairedSession(server=$server, account=$accountId, profile=$profile, token=<redacted>)"
}

/** Requests as made by [ServerApi.request]; replaceable in tests. */
fun interface PairingTransport {
    fun request(server: String, path: String, token: String, method: String, body: JSONObject?): JSONObject
}

/** Network half of pairing. Blocking: call off the main thread, and only after the person confirmed [PairingLink.server]. */
class PairingClient(private val transport: PairingTransport = PairingTransport { s, p, t, m, b -> ServerApi.request(s, p, t, m, b) }) {
    fun claim(link: PairingLink): PairedSession {
        val server = link.server
        // 1. Is this a Kindred server? The code is not sent otherwise.
        val meta = try { transport.request(server, "/identity/meta", "", "GET", null) }
            catch (e: IOException) { throw PairingError.transport(e) }
            catch (e: ApiFailure) { throw if (e.status in 300..399) PairingError.Redirected else PairingError.NotKindredServer }
        if (!meta.optBoolean("profiles")) throw PairingError.NotKindredServer

        // 2. Spend the one-time code. No Origin, cookies or Authorization.
        val claim = try { transport.request(server, "/identity/mobile-pairing/claim", "", "POST", JSONObject().put("code", link.code)) }
            catch (e: IOException) { throw PairingError.afterCodeSent(e) }
            catch (e: ApiFailure) { throw PairingError.claimStatus(e) }
        val token = claim.optString("token")
        val profile = claim.optString("profile_id")
        val accountId = canonicalUuid(claim.optString("account_id"))
        val login = claim.optString("login").trim().lowercase(Locale.ROOT)
        if (!validToken(token) || !validProfile(profile) || accountId == null || login.isEmpty() || login.length > 80) throw PairingError.InvalidResponse

        // 3. From here a session exists on the server; end it on any failure.
        val identity = try { transport.request(server, "/identity/profiles", token, "GET", null) }
            catch (e: Exception) {
                logout(server, token)
                throw if (e is IOException) PairingError.afterCodeSent(e) else if (e is ApiFailure && e.status in 300..399) PairingError.Redirected else PairingError.InvalidResponse
            }
        val active = identity.optString("active")
        val confirmed = !identity.optBoolean("legacy") && canonicalUuid(identity.optString("account_id")) == accountId &&
            identity.optString("username").lowercase(Locale.ROOT) == login && (active.isEmpty() || active == profile)
        if (!confirmed) { logout(server, token); throw PairingError.AccountMismatch }
        return PairedSession(server, token, profile, accountId, login)
    }

    fun logout(server: String, token: String) { runCatching { transport.request(server, "/identity/logout", token, "POST", null) } }

    companion object {
        private val TOKEN = Regex("[A-Za-z0-9._~+/=-]{16,512}")
        fun validToken(value: String) = TOKEN.matches(value)
        fun validProfile(value: String) = value.length in 1..160 && value.all { it.code in 0x21..0x7E }
        fun canonicalUuid(value: String): String? = if (value.length != 36) null else
            runCatching { UUID.fromString(value).toString() }.getOrNull()?.takeIf { it.equals(value, true) }
    }
}

/** Which saved account a pairing refreshes, and the session it replaces. */
object PairingAccounts {
    class Adopted(val account: Account, val replacedToken: String?)

    /** Same server and account ID first; older saves without an ID match by login. Everything else is kept. */
    fun adopt(saved: List<Account>, session: PairedSession, newId: () -> String = { UUID.randomUUID().toString() }): Adopted {
        val existing = saved.firstOrNull { it.server == session.server && it.accountId == session.accountId }
            ?: saved.firstOrNull { it.server == session.server && it.accountId.isEmpty() && it.username.equals(session.login, true) }
        val account = existing?.copy(username = session.login, token = session.token, profile = session.profile, accountId = session.accountId)
            ?: Account(newId(), session.server, session.login, session.token, session.profile, false, session.accountId)
        return Adopted(account, existing?.token?.takeIf { it.isNotEmpty() && it != session.token })
    }
}
