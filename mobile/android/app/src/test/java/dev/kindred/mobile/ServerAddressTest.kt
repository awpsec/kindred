package dev.kindred.mobile
import org.junit.Assert.*
import org.junit.Test
class ServerAddressTest {
    @Test fun canonicalOrigins() {
        assertEquals("https://example.com", ServerAddress.normalize(" HTTPS://EXAMPLE.COM:443/ "))
        assertEquals("https://box.example:9446", ServerAddress.normalize("box.example:9446"))
        assertEquals("https://[::1]:9446", ServerAddress.normalize("https://[::1]:9446"))
    }
    @Test fun rejectAmbiguousOrUnsafeAddresses() {
        listOf("http://example.com", "https://user:password@example.com", "https://example.com/chat", "https://example.com?x", "https://example.com#x", "javascript:alert(1)", "https://example.com:0", "https://example.com:99999", "https://example.com\\@evil.com").forEach { value ->
            assertThrows(value, IllegalArgumentException::class.java) { ServerAddress.normalize(value) }
        }
    }
    @Test fun exactOriginNotPrefix() {
        assertTrue(ServerAddress.sameOrigin("https://example.com/artifacts/a", "https://example.com"))
        assertFalse(ServerAddress.sameOrigin("https://example.com.evil.test/", "https://example.com"))
        assertFalse(ServerAddress.sameOrigin("http://example.com/", "https://example.com"))
        assertFalse(ServerAddress.sameOrigin("https://example.com:9446/", "https://example.com"))
    }
}
