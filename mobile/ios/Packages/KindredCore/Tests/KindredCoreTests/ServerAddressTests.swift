import XCTest
@testable import KindredCore

final class ServerAddressTests: XCTestCase {
    func testBareHostBecomesHTTPSOrigin() throws {
        let origin = try ServerAddress.normalize("  Kindred.Example.COM ")
        XCTAssertEqual(origin.serialized, "https://kindred.example.com")
        XCTAssertNil(origin.port)
        XCTAssertEqual(origin.rootURL.absoluteString, "https://kindred.example.com/")
    }

    func testExplicitHTTPSAndTrailingSlash() throws {
        XCTAssertEqual(try ServerAddress.normalize("HTTPS://kindred.example.com/").serialized, "https://kindred.example.com")
    }

    func testDefaultPortIsDroppedAndOthersKept() throws {
        XCTAssertEqual(try ServerAddress.normalize("kindred.example.com:443").serialized, "https://kindred.example.com")
        let custom = try ServerAddress.normalize("https://kindred.example.com:8443")
        XCTAssertEqual(custom.serialized, "https://kindred.example.com:8443")
        XCTAssertEqual(custom.displayName, "kindred.example.com:8443")
    }

    func testIPv6Literal() throws {
        let origin = try ServerAddress.normalize("https://[fd00::1]:9444")
        XCTAssertEqual(origin.host, "fd00::1")
        XCTAssertEqual(origin.serialized, "https://[fd00::1]:9444")
    }

    func testRefusesInsecureAndOtherSchemes() {
        XCTAssertThrowsError(try ServerAddress.normalize("http://kindred.example.com")) {
            XCTAssertEqual($0 as? ServerAddressError, .insecureScheme)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("http:kindred.example.com")) {
            XCTAssertEqual($0 as? ServerAddressError, .insecureScheme)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("ftp://kindred.example.com"))
        XCTAssertThrowsError(try ServerAddress.normalize("javascript:alert(1)"))
        XCTAssertThrowsError(try ServerAddress.normalize("https:kindred.example.com"))
    }

    func testRefusesCredentialsPathQueryFragment() {
        XCTAssertThrowsError(try ServerAddress.normalize("https://me:pw@kindred.example.com")) {
            XCTAssertEqual($0 as? ServerAddressError, .credentials)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("kindred.example.com@evil.example")) {
            XCTAssertEqual($0 as? ServerAddressError, .credentials)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("https://kindred.example.com/app")) {
            XCTAssertEqual($0 as? ServerAddressError, .path)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("https://kindred.example.com/?a=1")) {
            XCTAssertEqual($0 as? ServerAddressError, .query)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("https://kindred.example.com/#x")) {
            XCTAssertEqual($0 as? ServerAddressError, .fragment)
        }
        XCTAssertThrowsError(try ServerAddress.normalize("https://kindred.example.com#")) {
            XCTAssertEqual($0 as? ServerAddressError, .fragment)
        }
    }

    func testRefusesMalformedHosts() {
        for input in ["", "   ", "https://", "https:///kindred.example.com", "kin dred.example.com", "kindred..example.com",
                      "-kindred.example.com", "kindred.example.com.", "k%69ndred.example.com", "kindred.example.com:0",
                      "kindred.example.com:70000", "kindred.example.com:abc", "kïndred.example.com", "kindred\\example.com",
                      "[fe80::1%25en0]"] {
            XCTAssertThrowsError(try ServerAddress.normalize(input), "accepted \(input)")
        }
    }

    func testOriginMatchingIsExact() throws {
        let origin = try ServerAddress.normalize("kindred.example.com")
        XCTAssertTrue(origin.matches(URL(string: "https://kindred.example.com/artifacts/1?x#y")))
        XCTAssertTrue(origin.matches(URL(string: "https://KINDRED.example.com:443/")))
        XCTAssertFalse(origin.matches(URL(string: "http://kindred.example.com/")))
        XCTAssertFalse(origin.matches(URL(string: "https://kindred.example.com:8443/")))
        XCTAssertFalse(origin.matches(URL(string: "https://evil.kindred.example.com/")))
        XCTAssertFalse(origin.matches(URL(string: "https://kindred.example.com.evil.example/")))
        XCTAssertFalse(origin.matches(URL(string: "https://user@kindred.example.com/")))
        XCTAssertFalse(origin.matches(nil))
    }

    func testSecurityOriginMatching() throws {
        let origin = try ServerAddress.normalize("kindred.example.com")
        XCTAssertTrue(origin.matches(scheme: "https", host: "kindred.example.com", port: 0))
        XCTAssertTrue(origin.matches(scheme: "https", host: "kindred.example.com", port: 443))
        XCTAssertFalse(origin.matches(scheme: "http", host: "kindred.example.com", port: 0))
        XCTAssertFalse(origin.matches(scheme: "https", host: "kindred.example.com", port: 8443))
        XCTAssertFalse(origin.matches(scheme: "https", host: "other.example.com", port: 0))
    }

    func testCodableRoundTripRevalidates() throws {
        let origin = try ServerAddress.normalize("kindred.example.com:8443")
        let data = try JSONEncoder().encode([origin])
        XCTAssertTrue(String(decoding: data, as: UTF8.self).contains("kindred.example.com:8443"))
        XCTAssertEqual(try JSONDecoder().decode([ServerOrigin].self, from: data), [origin])
        XCTAssertThrowsError(try JSONDecoder().decode([ServerOrigin].self, from: Data("[\"http://x.example\"]".utf8)))
    }

    func testURLPathRejectsSchemeRelative() throws {
        let origin = try ServerAddress.normalize("kindred.example.com")
        XCTAssertEqual(origin.url(path: "/identity/login")?.absoluteString, "https://kindred.example.com/identity/login")
        XCTAssertNil(origin.url(path: "//evil.example/"))
        XCTAssertNil(origin.url(path: "identity"))
    }
}
