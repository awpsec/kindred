package dev.kindred.mobile

import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException

class PairingLinkTest {
    private val code = "ab12".repeat(16)
    private fun link(server: String, fragment: String = "code=$code") = "kindred://pair?server=$server#$fragment"
    private fun kind(raw: String) = try { PairingLink.parse(raw); null } catch (e: PairingLinkError) { e.kind }

    @Test fun parsesAndCanonicalizes() {
        val parsed = PairingLink.parse("  " + link("https%3A%2F%2FKindred.Example.com%3A9446") + "\n")
        assertEquals("https://kindred.example.com:9446", parsed.server)
        assertEquals(code, parsed.code)
        assertEquals("https://box.example", PairingLink.parse("KINDRED://PAIR/?server=https%3A%2F%2Fbox.example%3A443%2F#code=${code.uppercase()}").server)
        assertEquals(code, PairingLink.parse(link("https://box.example", "code=${code.uppercase()}")).code)
        assertEquals("https://[fd7a:115c::1]:9446", PairingLink.parse(link("https%3A%2F%2F%5Bfd7a%3A115c%3A%3A1%5D%3A9446")).server)
        assertEquals("https://100.64.1.2", PairingLink.parse(link("https%3A%2F%2F100.64.1.2")).server)
    }

    @Test fun secretIsRedacted() {
        val parsed = PairingLink.parse(link("https%3A%2F%2Fbox.example"))
        assertFalse(parsed.toString().contains(code))
        assertFalse("$parsed".contains(code))
    }

    @Test fun rejectsOtherLinks() {
        listOf("https://box.example/pair#code=$code", "kindred://open?server=https%3A%2F%2Fbox.example#code=$code",
            "kindred://user@pair?server=https%3A%2F%2Fbox.example#code=$code", "kindred://pair:80?server=https%3A%2F%2Fbox.example#code=$code",
            "kindred://pair/extra?server=https%3A%2F%2Fbox.example#code=$code", "kindred://pair?server=https%3A%2F%2Fbox.example #code=$code",
            "kindred://pair?server=https%3A%2F%2Fbox.exämple#code=$code", "kindred://pair?server=https%3A%2F%2Fbox.example%2#code=$code").forEach { assertNotNull(it, kind(it)) }
        assertEquals(PairingLinkError.Kind.EMPTY, kind("  "))
    }

    @Test fun rejectsInsecureOrAmbiguousServers() {
        assertEquals(PairingLinkError.Kind.INSECURE_SERVER, kind(link("http%3A%2F%2Fbox.example")))
        listOf("box.example", "ftp%3A%2F%2Fbox.example", "https%3A%2F%2Fbox.example%2Fchat", "https%3A%2F%2Fbox.example%3Fx%3D1",
            "https%3A%2F%2Fuser%3Apw%40box.example", "https%3A%2F%2Fbox.example%3A0", "https%3A%2F%2F127.1", "https%3A%2F%2F0x7f.0.0.1",
            "https%3A%2F%2F2130706433", "https%3A%2F%2F010.0.0.1", "https%3A%2F%2Fbox%20.example").forEach {
            assertEquals(it, PairingLinkError.Kind.INVALID_SERVER, kind(link(it)))
        }
    }

    @Test fun rejectsLoopback() {
        listOf("https%3A%2F%2Flocalhost%3A9446", "https%3A%2F%2Fapp.localhost", "https%3A%2F%2F127.0.0.1", "https%3A%2F%2F127.20.30.40%3A9446",
            "https%3A%2F%2F0.0.0.0", "https%3A%2F%2F%5B%3A%3A1%5D", "https%3A%2F%2F%5B%3A%3A%5D", "https%3A%2F%2F%5B%3A%3Affff%3A127.0.0.1%5D",
            "https%3A%2F%2F%5B0%3A0%3A0%3A0%3A0%3Affff%3A7f00%3A1%5D").forEach {
            assertEquals(it, PairingLinkError.Kind.LOOPBACK_SERVER, kind(link(it)))
        }
    }

    @Test fun rejectsMissingDuplicateOrMisplacedCodes() {
        listOf("kindred://pair?server=https%3A%2F%2Fbox.example", link("https%3A%2F%2Fbox.example", "code=" + code.dropLast(1)),
            link("https%3A%2F%2Fbox.example", "code=${code}0"), link("https%3A%2F%2Fbox.example", "code=" + "g".repeat(64)),
            link("https%3A%2F%2Fbox.example", "secret=$code"), link("https%3A%2F%2Fbox.example", "code=$code&code=$code"),
            "kindred://pair?server=https%3A%2F%2Fbox.example&code=$code",
            "kindred://pair?server=https%3A%2F%2Fbox.example&server=https%3A%2F%2Fevil.example#code=$code",
            "kindred://pair?server=https%3A%2F%2Fbox.example&x=1#code=$code").forEach { assertNotNull(it, kind(it)) }
    }

    @Test fun hostClassification() {
        assertEquals(HostClass.ROUTABLE, HostClass.of("kindred.example.com"))
        assertEquals(HostClass.ROUTABLE, HostClass.of("192.168.1.20"))
        assertEquals(HostClass.ROUTABLE, HostClass.of("fd7a:115c:a1e0::1"))
        assertEquals(HostClass.ROUTABLE, HostClass.of("::ffff:192.168.1.2"))
        assertEquals(HostClass.AMBIGUOUS, HostClass.of("1:2:3:4:5:6:7:8:9"))
        assertEquals(HostClass.AMBIGUOUS, HostClass.of("1::2::3"))
        assertEquals(HostClass.AMBIGUOUS, HostClass.of("256.1.1.1"))
        assertEquals(HostClass.LOOPBACK, HostClass.of("127.0.0.1"))
    }

    @Test fun recognizesKindredShapedText() {
        assertTrue(PairingLink.looksLikePairingLink(" Kindred://pair?server=x"))
        assertFalse(PairingLink.looksLikePairingLink("https://example.com"))
    }
}

class PairingClientTest {
    private val code = "c".repeat(64)
    private val token = "t0".repeat(20)
    private val account = "6F9619FF-8B86-D011-B42D-00CF4FC964FF"
    private val link = PairingLink.parse("kindred://pair?server=https%3A%2F%2Fbox.example#code=$code")

    private class Call(val path: String, val token: String, val method: String, val body: JSONObject?)
    private class Fake(val handler: (String, String) -> Any) : PairingTransport {
        val calls = mutableListOf<Call>()
        override fun request(server: String, path: String, token: String, method: String, body: JSONObject?): JSONObject {
            assertEquals("https://box.example", server)
            calls += Call(path, token, method, body)
            return when (val r = handler(path, token)) { is Exception -> throw r; is String -> JSONObject(r); else -> r as JSONObject }
        }
    }
    private fun kindred(claim: Any = """{"token":"$token","profile_id":"p-1","account_id":"$account","login":" Ada "}""",
                        identity: String = """{"active":"p-1","account_id":"${account.lowercase()}","username":"ada","legacy":false}""",
                        meta: String = """{"profiles":true}""") = Fake { path, _ ->
        when (path) {
            "/identity/meta" -> meta
            "/identity/mobile-pairing/claim" -> claim
            "/identity/profiles" -> identity
            "/identity/logout" -> "{}"
            else -> ApiFailure(404, "missing")
        }
    }
    private fun failure(fake: Fake): PairingError = try { PairingClient(fake).claim(link); throw AssertionError("expected failure") } catch (e: PairingError) { e }

    @Test fun claimsVerifiesAndRedactsSession() {
        val fake = kindred()
        val session = PairingClient(fake).claim(link)
        assertEquals(listOf("/identity/meta", "/identity/mobile-pairing/claim", "/identity/profiles"), fake.calls.map { it.path })
        val claim = fake.calls[1]
        assertEquals("POST", claim.method); assertEquals("", claim.token)
        assertEquals(code, claim.body!!.getString("code")); assertEquals(1, claim.body.length())
        assertEquals(token, fake.calls[2].token)
        assertEquals(token, session.token); assertEquals("p-1", session.profile)
        assertEquals(account.lowercase(), session.accountId); assertEquals("ada", session.login)
        assertFalse(session.toString().contains(token))
    }

    @Test fun codeIsNeverSentToNonKindredServers() {
        for (fake in listOf(kindred(meta = """{"hello":"world"}"""), Fake { _, _ -> ApiFailure(404, "nope") })) {
            assertSame(PairingError.NotKindredServer, failure(fake))
            assertTrue(fake.calls.none { it.path.contains("pairing") })
        }
        assertSame(PairingError.Redirected, failure(Fake { _, _ -> ApiFailure(302, "moved") }))
    }

    @Test fun transportFailuresAreUnreachableWithHelp() {
        val offline = failure(Fake { _, _ -> UnknownHostException("box.example") })
        assertTrue(offline is PairingError.Unreachable)
        assertEquals("Could not connect to server", offline.title)
        assertTrue(offline.showsConnectionHelp); assertTrue(offline.allowsManualRetry)
        assertEquals("Kindred couldn't find that server.", (offline as PairingError.Unreachable).detail)
        val tls = failure(Fake { _, _ -> SSLHandshakeException("bad cert") }) as PairingError.Unreachable
        assertTrue(tls.detail.contains("certificate"))
        assertEquals(4, PairingError.CONNECTION_CHECKLIST.size)
        assertTrue(PairingError.CONNECTION_CHECKLIST.any { "All interfaces" in it })
        assertTrue(PairingError.CONNECTION_CHECKLIST.any { "Connection addresses" in it })
    }

    @Test fun lostConnectionAfterSendingTheCodeIsUnconfirmedAndNotRetryable() {
        for (dropped in listOf(java.net.SocketTimeoutException("timeout"), IOException("reset"), SSLHandshakeException("closed"))) {
            val fake = kindred(claim = dropped)
            val error = failure(fake)
            assertTrue("$dropped", error is PairingError.ClaimUnconfirmed)
            assertEquals("Pairing wasn't confirmed", error.title)
            assertFalse("the code may be spent", error.allowsManualRetry)
            assertTrue(error.showsConnectionHelp)
            assertEquals(1, fake.calls.count { it.path == "/identity/mobile-pairing/claim" })
        }
    }

    @Test fun rejectedCodesAreDistinctAndNotRetried() {
        for (status in listOf(400, 401, 403, 409, 410, 422)) {
            val fake = kindred(claim = ApiFailure(status, "Pairing code is invalid or expired", fromServer = true))
            val error = failure(fake)
            assertSame(PairingError.CodeRejected, error)
            assertFalse(error.showsConnectionHelp); assertFalse(error.allowsManualRetry)
            assertEquals(1, fake.calls.count { it.path == "/identity/mobile-pairing/claim" })
        }
        assertSame(PairingError.CodeRejected, failure(kindred(claim = ApiFailure(404, "Unknown code", fromServer = true))))
        assertSame(PairingError.Unsupported, failure(kindred(claim = ApiFailure(404, "The server could not complete this request (404)."))))
        assertSame(PairingError.RateLimited, failure(kindred(claim = ApiFailure(429, "slow down"))))
        assertSame(PairingError.Redirected, failure(kindred(claim = ApiFailure(307, "moved"))))
        assertEquals("Server is starting", failure(kindred(claim = ApiFailure(503, "Server is starting", fromServer = true))).message)
    }

    @Test fun malformedClaimsAreRejected() {
        listOf("{}", """{"token":"short","profile_id":"p","account_id":"$account","login":"ada"}""",
            """{"token":"$token","profile_id":"p","account_id":"nope","login":"ada"}""",
            """{"token":"$token","profile_id":"p","account_id":"$account","login":""}""",
            """{"token":"$token","profile_id":"has space","account_id":"$account","login":"ada"}""").forEach {
            assertSame(it, PairingError.InvalidResponse, failure(kindred(claim = it)))
        }
    }

    @Test fun mismatchedIdentityEndsTheSession() {
        listOf("""{"active":"p-1","account_id":"11111111-2222-3333-4444-555555555555","username":"ada"}""",
            """{"active":"p-1","account_id":"$account","username":"bob"}""",
            """{"active":"p-9","account_id":"$account","username":"ada"}""",
            """{"active":"p-1","account_id":"$account","username":"ada","legacy":true}""").forEach {
            val fake = kindred(identity = it)
            assertSame(it, PairingError.AccountMismatch, failure(fake))
            assertEquals(token, fake.calls.single { c -> c.path == "/identity/logout" }.token)
        }
        val unreachable = kindred(identity = "x").let { Fake { path, t -> if (path == "/identity/profiles") IOException("reset") else it.handler(path, t) } }
        assertTrue("the code was spent before identity failed", failure(unreachable) is PairingError.ClaimUnconfirmed)
        assertTrue(unreachable.calls.any { it.path == "/identity/logout" })
    }
}

class PairingAccountsTest {
    private val id = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
    private val session = PairedSession("https://box.example", "new".repeat(6), "p-2", id, "ada")

    @Test fun refreshesTheSameServerAccountOnly() {
        val paired = Account("a", "https://box.example", "ada", "old".repeat(6), "p-1", alerts = true, accountId = id)
        val elsewhere = Account("b", "https://other.example", "ada", "x".repeat(16), "p-1", accountId = id)
        val result = PairingAccounts.adopt(listOf(elsewhere, paired), session)
        assertEquals("a", result.account.id)
        assertTrue("alert choice kept", result.account.alerts)
        assertEquals(session.token, result.account.token); assertEquals("p-2", result.account.profile)
        assertEquals("old".repeat(6), result.replacedToken)
    }

    @Test fun legacySaveMatchesByLoginButNotAnotherUser() {
        val legacy = Account("l", "https://box.example", "ADA", "", "p-1")
        assertEquals("l", PairingAccounts.adopt(listOf(legacy), session).account.id)
        assertNull(PairingAccounts.adopt(listOf(legacy), session).replacedToken)
        val recreated = Account("r", "https://box.example", "ada", "t".repeat(16), "p-1", accountId = "11111111-2222-3333-4444-555555555555")
        val result = PairingAccounts.adopt(listOf(recreated), session) { "fresh" }
        assertEquals("fresh", result.account.id)
        assertEquals(id, result.account.accountId)
        assertNull(result.replacedToken)
    }

    @Test fun accountJsonKeepsIdAndRedactsToken() {
        val account = Account("a", "https://box.example", "ada", "secret-token-value", "p", accountId = id)
        assertEquals(account, Account.read(account.json()))
        assertEquals("", Account.read(JSONObject(account.json().toString()).apply { remove("account_id") }).accountId)
        assertFalse(account.toString().contains("secret-token-value"))
    }
}

class QrDecoderTest {
    private fun render(text: String, size: Int, inverted: Boolean = false, rowPadding: Int = 0): Pair<ByteArray, Int> {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
        val stride = size + rowPadding
        val bytes = ByteArray(stride * size) { 0x55 }
        for (y in 0 until size) for (x in 0 until size) {
            val dark = matrix[x, y] != inverted
            bytes[y * stride + x] = if (dark) 0x10 else 0xF0.toByte()
        }
        return bytes to stride
    }

    @Test fun decodesPairingLinksOnDevice() {
        val text = "kindred://pair?server=https%3A%2F%2Fbox.example%3A9446#code=" + "ab".repeat(32)
        val (bytes, _) = render(text, 400)
        assertEquals(text, QrDecoder().decode(bytes, 400, 400))
    }

    @Test fun decodesInvertedAndPaddedFrames() {
        val text = "kindred://pair?server=https%3A%2F%2Fbox.example#code=" + "cd".repeat(32)
        val (inverted, _) = render(text, 360, inverted = true)
        assertEquals(text, QrDecoder().decode(inverted, 360, 360))
        val (padded, stride) = render(text, 360, rowPadding = 24)
        val packed = QrDecoder.pack(java.nio.ByteBuffer.wrap(padded), stride, 360, 360)
        assertEquals(text, QrDecoder().decode(packed, 360, 360))
    }

    @Test fun blankFramesReturnNothing() {
        assertNull(QrDecoder().decode(ByteArray(320 * 240) { 0x40 }, 320, 240))
        assertNull(QrDecoder().decode(ByteArray(10), 320, 240))
    }
}
