import XCTest
@testable import KindredCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class PrivateAddressTests: XCTestCase {
    func testPrivateIPv4AndIPv6InferHTTPWithExactPort() throws {
        for input in ["10.1.2.3:9444", "172.16.0.1:9444", "172.31.255.254:9444", "192.168.1.20:9444", "100.64.0.1:9444", "100.127.255.254:9444", "[fd7a:115c::5]:9444"] {
            XCTAssertEqual(try ServerAddress.normalize(input).serialized, "http://" + input)
            XCTAssertEqual(try ServerAddress.normalize("http://" + input).serialized, "http://" + input)
        }
    }

    func testPublicAndNamedHTTPRefused() {
        for input in ["http://8.8.8.8:9444", "http://11.0.0.1", "http://172.15.0.1", "http://172.32.0.1", "http://100.63.255.254", "http://100.128.0.1", "http://[fc00::1]", "http://[fe80::1]", "http://[::ffff:192.168.1.20]", "http://computer.tailnet.ts.net:9444", "http://computer.local:9444", "http://kindred.example.com"] {
            XCTAssertThrowsError(try ServerAddress.normalize(input), input)
        }
    }

    func testExplicitHTTPSAndNamedDefaultsStayHTTPS() throws {
        for input in ["https://192.168.1.20:9444", "https://[fd7a::5]:9444", "kindred.example.com:9444"] {
            let expected = input.hasPrefix("https://") ? input : "https://" + input
            XCTAssertEqual(try ServerAddress.normalize(input).serialized, expected)
        }
        XCTAssertEqual(try ServerAddress.normalize("192.168.1.20:80").serialized, "http://192.168.1.20")
        XCTAssertEqual(try ServerAddress.normalize("https://192.168.1.20:443").serialized, "https://192.168.1.20")
        XCTAssertEqual(try ServerAddress.normalize("http://192.168.1.20:443").serialized, "http://192.168.1.20:443")
    }

    func testIPv6CanonicalizesForBrowserOriginComparison() throws {
        let origin = try ServerAddress.normalize("http://[fd7a:115c:0000:0000:0000:0000:0000:0005]:9444")
        XCTAssertEqual(origin.serialized, "http://[fd7a:115c::5]:9444")
        XCTAssertTrue(origin.matches(URL(string: "http://[fd7a:115c::5]:9444/chat")))
        XCTAssertTrue(origin.matches(scheme: "http", host: "fd7a:115c::5", port: 9444))
        for input in ["http://[fd7a:::5]", "http://[fd7a:1:2:3:4:5:6:7:8]", "http://[fd7a::5%25en0]"] { XCTAssertThrowsError(try ServerAddress.normalize(input)) }
    }

    func testSpecificManualInputErrors() {
        let examples = [("fd7a::5:9444", "Put IPv6 addresses in brackets, for example [fd7a::5]:9444."),
                        ("192.168.1.20:abc", "Port must be a number from 1 to 65535."),
                        ("192.168.1.20:0", "Port must be a number from 1 to 65535."),
                        ("192.168.1.20:65536", "Port must be a number from 1 to 65535."),
                        ("localhost:9444", "This address is only on this phone (localhost). Enter your computer's address.")]
        for (input, message) in examples {
            do { _ = try ServerAddress.normalize(input); XCTFail("Accepted \(input)") }
            catch { XCTAssertEqual(error.localizedDescription, message, input) }
        }
    }

    func testLoopbackAndNumericAliasesCannotCreateNewAccounts() {
        for input in ["127.0.0.1:9444", "0.0.0.0", "[::1]:9444", "127.1", "2130706433", "0x7f.0.0.1", "192.168.001.20", "http://192.168.1.20:"] { XCTAssertThrowsError(try ServerAddress.normalize(input), input) }
    }

    func testSchemeAndPortKeepAccountOriginsSeparate() throws {
        let http = try ServerAddress.normalize("http://192.168.1.20:9444"), https = try ServerAddress.normalize("https://192.168.1.20:9444")
        XCTAssertNotEqual(http, https); XCTAssertEqual(Set([http, https]).count, 2)
        XCTAssertFalse(http.matches(https.rootURL)); XCTAssertFalse(http.matches(scheme: "https", host: http.host, port: 9444))
        XCTAssertFalse(http.matches(URL(string: "http://192.168.1.20:9445/")))
        let saved = Account(origin: https, login: "ada")
        XCTAssertNil(AccountGrouping.existing(in: [saved], origin: http, login: "ada"))
        XCTAssertEqual(AccountGrouping.existing(in: [saved], origin: https, login: "ada")?.id, saved.id)
    }

    func testSavedHTTPSAndHTTPRoundTripSeparately() throws {
        let values = [try ServerAddress.normalize("http://192.168.1.20:9444"), try ServerAddress.normalize("https://192.168.1.20:9444")]
        XCTAssertEqual(try JSONDecoder().decode([ServerOrigin].self, from: JSONEncoder().encode(values)), values)
        let legacy = try JSONDecoder().decode(ServerOrigin.self, from: Data("\"https://127.0.0.1:9444\"".utf8))
        XCTAssertEqual(legacy.serialized, "https://127.0.0.1:9444")
        let oldAlias = try JSONDecoder().decode(ServerOrigin.self, from: Data("\"https://127.1:9444\"".utf8))
        XCTAssertEqual(oldAlias.serialized, "https://127.1:9444", "Loading legacy HTTPS metadata must not discard other saved accounts")
    }

    func testNativeRequestsAndNavigationUseTheExactPrivateOrigin() throws {
        let origin = try ServerAddress.normalize("http://192.168.1.20:9444")
        let request = try KindredRequests.login(origin: origin, login: "ada", password: "synthetic")
        XCTAssertEqual(request.url?.absoluteString, "http://192.168.1.20:9444/identity/login")
        let policy = NavigationPolicy(origin: origin)
        XCTAssertEqual(policy.decide(url: origin.rootURL, isMainFrame: true, trigger: .other), .allow)
        XCTAssertTrue(policy.allowsMainFrameResponse(from: origin.rootURL))
        XCTAssertTrue(policy.allowsDownload(from: origin.url(path: "/file")))
        XCTAssertFalse(policy.allowsMainFrameResponse(from: URL(string: "https://192.168.1.20:9444/")))
        XCTAssertNotEqual(policy.decide(url: URL(string: "http://192.168.1.21:9444/"), isMainFrame: true, trigger: .other), .allow)
        let response = HTTPURLResponse(url: URL(string: "https://192.168.1.20:9444/identity/login")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response, data: Data()))
    }

    func testPrivatePairingRetainsOriginAndRedactsCode() throws {
        let code = String(repeating: "a", count: 64)
        let raw = "kindred://pair?server=http%3A%2F%2F192.168.1.20%3A9444#code=" + code
        let link = try PairingLink.parse(raw)
        XCTAssertEqual(link.origin.serialized, "http://192.168.1.20:9444")
        XCTAssertFalse(link.description.contains(code))
        XCTAssertThrowsError(try PairingLink.parse(raw.replacingOccurrences(of: "192.168.1.20", with: "8.8.8.8")))
    }
    func testPrivateConfirmationRequiresExactOriginAndHTTPSDoesNotNeedIt() throws {
        let origin = try ServerAddress.normalize("http://192.168.1.20:9444")
        let other = [try ServerAddress.normalize("https://192.168.1.20:9444"),
                     try ServerAddress.normalize("http://192.168.1.21:9444"),
                     try ServerAddress.normalize("http://192.168.1.20:9445")]
        XCTAssertThrowsError(try ServerConnectionConsent.require(origin: origin, confirmedPrivateOrigin: nil))
        for value in other {
            XCTAssertThrowsError(try ServerConnectionConsent.require(origin: origin, confirmedPrivateOrigin: value)) {
                XCTAssertEqual($0 as? ServerAddressError, .privateConfirmation)
            }
        }
        XCTAssertNoThrow(try ServerConnectionConsent.require(origin: origin, confirmedPrivateOrigin: origin))
        XCTAssertNoThrow(try ServerConnectionConsent.require(origin: other[0], confirmedPrivateOrigin: nil))
    }

}
