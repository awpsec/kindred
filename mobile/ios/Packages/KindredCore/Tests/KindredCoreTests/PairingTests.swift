import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import KindredCore

final class PairingLinkTests: XCTestCase {
    private let code = String(repeating: "ab12", count: 16)

    private func link(_ server: String, fragment: String? = nil) -> String {
        "kindred://pair?server=\(server)#\(fragment ?? "code=" + code)"
    }

    func testParsesPercentEncodedOrigin() throws {
        let parsed = try PairingLink.parse("  " + link("https%3A%2F%2FKindred.Example.com%3A9446") + "\n")
        XCTAssertEqual(parsed.origin.serialized, "https://kindred.example.com:9446")
        XCTAssertEqual(parsed.code, code)
    }

    func testCanonicalizesDefaultPortAndCaseAndCode() throws {
        let parsed = try PairingLink.parse("KINDRED://PAIR/?server=https%3A%2F%2Fbox.example%3A443%2F#code=" + code.uppercased())
        XCTAssertEqual(parsed.origin.serialized, "https://box.example")
        XCTAssertEqual(parsed.code, code, "code is lowercased before it is sent")
    }

    func testAcceptsUnencodedOriginAndIPv6() throws {
        XCTAssertEqual(try PairingLink.parse(link("https://box.example:9446")).origin.serialized, "https://box.example:9446")
        XCTAssertEqual(try PairingLink.parse(link("https%3A%2F%2F%5Bfd7a%3A115c%3A%3A1%5D%3A9446")).origin.serialized,
                       "https://[fd7a:115c::1]:9446")
        XCTAssertEqual(try PairingLink.parse(link("https%3A%2F%2F100.64.1.2")).origin.serialized, "https://100.64.1.2")
    }

    func testSecretNeverAppearsInStringForms() throws {
        let parsed = try PairingLink.parse(link("https%3A%2F%2Fbox.example"))
        XCTAssertFalse(String(describing: parsed).contains(code))
        XCTAssertFalse(String(reflecting: parsed).contains(code))
        XCTAssertFalse("\(parsed)".contains(code))
    }

    func testRejectsOtherLinks() {
        for value in ["", "https://box.example/pair#code=\(code)", "kindred://open?server=https%3A%2F%2Fbox.example#code=\(code)",
                      "kindred://user@pair?server=https%3A%2F%2Fbox.example#code=\(code)",
                      "kindred://pair:80?server=https%3A%2F%2Fbox.example#code=\(code)",
                      "kindred://pair/extra?server=https%3A%2F%2Fbox.example#code=\(code)",
                      "kindred://pair?server=https%3A%2F%2Fbox.example #code=\(code)",
                      "kindred://pair?server=https%3A%2F%2Fbox.ex\u{00E4}mple#code=\(code)"] {
            XCTAssertThrowsError(try PairingLink.parse(value), value)
        }
    }

    func testRejectsInsecureOrAmbiguousServers() {
        let cases: [(String, PairingLinkError)] = [
            ("http%3A%2F%2Fbox.example", .insecureServer),
            ("box.example", .invalidServer),
            ("ftp%3A%2F%2Fbox.example", .invalidServer),
            ("https%3A%2F%2Fbox.example%2Fchat", .invalidServer),
            ("https%3A%2F%2Fbox.example%3Fx%3D1", .invalidServer),
            ("https%3A%2F%2Fuser%3Apw%40box.example", .invalidServer),
            ("https%3A%2F%2Fbox.example%3A0", .invalidServer),
            ("https%3A%2F%2F127.1", .invalidServer),
            ("https%3A%2F%2F0x7f.0.0.1", .invalidServer),
            ("https%3A%2F%2F2130706433", .invalidServer),
            ("https%3A%2F%2F010.0.0.1", .invalidServer),
        ]
        for (server, expected) in cases {
            XCTAssertThrowsError(try PairingLink.parse(link(server)), server) {
                XCTAssertEqual($0 as? PairingLinkError, expected, server)
            }
        }
    }

    func testRejectsLoopbackServers() {
        for server in ["https%3A%2F%2Flocalhost%3A9446", "https%3A%2F%2Fapp.localhost", "https%3A%2F%2F127.0.0.1",
                       "https%3A%2F%2F127.20.30.40%3A9446", "https%3A%2F%2F0.0.0.0", "https%3A%2F%2F%5B%3A%3A1%5D",
                       "https%3A%2F%2F%5B%3A%3A%5D", "https%3A%2F%2F%5B%3A%3Affff%3A127.0.0.1%5D",
                       "https%3A%2F%2F%5B0%3A0%3A0%3A0%3A0%3Affff%3A7f00%3A1%5D", "https%3A%2F%2F%5B0000%3A0%3A0%3A0%3A0%3A0%3A0%3A1%5D"] {
            XCTAssertThrowsError(try PairingLink.parse(link(server)), server) {
                XCTAssertEqual($0 as? PairingLinkError, .loopbackServer, server)
            }
        }
    }

    func testRejectsMissingDuplicateOrMisplacedCodes() {
        let bad = [
            "kindred://pair?server=https%3A%2F%2Fbox.example",
            link("https%3A%2F%2Fbox.example", fragment: "code=" + code.dropLast()),
            link("https%3A%2F%2Fbox.example", fragment: "code=" + code + "0"),
            link("https%3A%2F%2Fbox.example", fragment: "code=" + String(repeating: "g", count: 64)),
            link("https%3A%2F%2Fbox.example", fragment: "secret=" + code),
            link("https%3A%2F%2Fbox.example", fragment: "code=\(code)&code=\(code)"),
            "kindred://pair?server=https%3A%2F%2Fbox.example&code=\(code)",
            "kindred://pair?server=https%3A%2F%2Fbox.example&server=https%3A%2F%2Fevil.example#code=\(code)",
            "kindred://pair?server=https%3A%2F%2Fbox.example&x=1#code=\(code)",
        ]
        for value in bad { XCTAssertThrowsError(try PairingLink.parse(value), value) }
    }

    func testRecognizesKindredShapedText() {
        XCTAssertTrue(PairingLink.looksLikePairingLink(" Kindred://pair?server=x"))
        XCTAssertFalse(PairingLink.looksLikePairingLink("https://example.com"))
    }

    func testHostClassification() {
        XCTAssertEqual(HostClass.of("kindred.example.com"), .routable)
        XCTAssertEqual(HostClass.of("192.168.1.20"), .routable)
        XCTAssertEqual(HostClass.of("fd7a:115c:a1e0::1"), .routable)
        XCTAssertEqual(HostClass.of("::ffff:192.168.1.2"), .routable)
        XCTAssertEqual(HostClass.of("1:2:3:4:5:6:7:8:9"), .ambiguous)
        XCTAssertEqual(HostClass.of("1::2::3"), .ambiguous)
        XCTAssertEqual(HostClass.of("256.1.1.1"), .ambiguous)
        XCTAssertEqual(HostClass.of("127.0.0.1"), .loopback)
    }
}

final class PairingClaimTests: XCTestCase {
    private let token = String(repeating: "t0", count: 20)
    private let account = "6F9619FF-8B86-D011-B42D-00CF4FC964FF"
    private let code = String(repeating: "c", count: 64)

    private func pairing() throws -> PairingLink {
        try PairingLink.parse("kindred://pair?server=https%3A%2F%2Fbox.example#code=" + code)
    }

    private func respond(_ status: Int, _ body: String, url: String = "https://box.example/identity/mobile-pairing/claim") throws -> PairingClaim {
        let request = try KindredRequests.claimPairing(try pairing())
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return try PairingResponse.claim(request: request, response: response, data: Data(body.utf8))
    }

    private func assertFails(_ status: Int, _ body: String, _ expected: PairingError, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try respond(status, body), file: file, line: line) {
            XCTAssertEqual($0 as? PairingError, expected, file: file, line: line)
        }
    }

    func testClaimRequestCarriesOnlyTheCode() throws {
        let request = try KindredRequests.claimPairing(try pairing())
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://box.example/identity/mobile-pairing/claim")
        XCTAssertNil(request.value(forHTTPHeaderField: "Origin"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertFalse(request.httpShouldHandleCookies)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(body, ["code": code])
        XCTAssertFalse(request.url!.absoluteString.contains(code))
    }

    func testValidClaim() throws {
        let claim = try respond(200, #"{"token":"\#(token)","profile_id":"p-2","account_id":"\#(account)","login":" Ada "}"#)
        XCTAssertEqual(claim.token, token)
        XCTAssertEqual(claim.profileID, "p-2")
        XCTAssertEqual(claim.serverAccountID, account.lowercased())
        XCTAssertEqual(claim.login, "ada")
        XCTAssertFalse(String(describing: claim).contains(token))
    }

    func testMalformedClaimIsRejected() {
        for body in ["{}", "not json", #"{"token":"short","profile_id":"p","account_id":"\#(account)","login":"ada"}"#,
                     #"{"token":"\#(token)","profile_id":"p","account_id":"nope","login":"ada"}"#,
                     #"{"token":"\#(token)","profile_id":"p","account_id":"\#(account)","login":""}"#,
                     #"{"token":"\#(token)","profile_id":"has space","account_id":"\#(account)","login":"ada"}"#] {
            assertFails(200, body, .invalidResponse)
        }
    }

    func testRejectedCodesAreDistinctFromMissingRoute() {
        for status in [400, 401, 403, 409, 410, 422] {
            assertFails(status, #"{"error":"expired"}"#, .codeRejected)
            assertFails(status, "", .codeRejected)
        }
        assertFails(404, #"{"error":"Pairing code not found"}"#, .codeRejected)
        assertFails(404, "<html>Not Found</html>", .unsupported)
        assertFails(429, "", .rateLimited)
        assertFails(503, #"{"error":"Server is starting"}"#, .server("Server is starting"))
        assertFails(500, "", .server("The server returned an error (500)."))
    }

    func testRedirectsAreRefused() {
        assertFails(302, "", .redirected)
        XCTAssertThrowsError(try respond(200, "{}", url: "https://evil.example/identity/mobile-pairing/claim")) {
            XCTAssertEqual($0 as? PairingError, .redirected)
        }
    }

    func testOnlyUnreachableOffersHelpAndRetry() {
        XCTAssertTrue(PairingError.unreachable(detail: "x").showsConnectionHelp)
        XCTAssertTrue(PairingError.unreachable(detail: "x").allowsManualRetry)
        XCTAssertEqual(PairingError.unreachable(detail: "x").title, "Could not connect to server")
        for error in [PairingError.codeRejected, .unsupported, .redirected, .rateLimited, .invalidResponse, .claimUnconfirmed(detail: "x")] {
            XCTAssertFalse(error.allowsManualRetry)
        }
        for error in [PairingError.codeRejected, .unsupported, .redirected, .rateLimited, .invalidResponse] {
            XCTAssertFalse(error.showsConnectionHelp)
            XCTAssertFalse(error.allowsManualRetry)
        }
        XCTAssertEqual(PairingError.connectionChecklist.count, 4)
    }

    func testLostConnectionAfterSendingTheCodeIsUnconfirmed() {
        let lost = PairingError.afterCodeSent(KindredAPIError.transport("The network connection was lost."))
        XCTAssertEqual(lost, .claimUnconfirmed(detail: "The network connection was lost."))
        XCTAssertFalse(lost.allowsManualRetry, "the code may be spent; only a new code is offered")
        XCTAssertTrue(lost.showsConnectionHelp)
        XCTAssertEqual(lost.title, "Pairing wasn't confirmed")
        XCTAssertEqual(PairingError.afterCodeSent(KindredAPIError.redirectRefused), .redirected)
        XCTAssertEqual(PairingError.afterCodeSent(PairingError.codeRejected), .codeRejected)
    }

    func testClaimTransportFailureIsUnconfirmed() async throws {
        let configuration = KindredAPIClient.defaultConfiguration()
        configuration.protocolClasses = [DroppingProtocol.self]
        let client = KindredAPIClient(configuration: configuration)
        defer { client.invalidate() }
        do {
            _ = try await client.claimPairing(try pairing())
            XCTFail("expected failure")
        } catch {
            guard case .claimUnconfirmed? = error as? PairingError else { return XCTFail("got \(error)") }
        }
        do {
            try await client.verifyKindredServer(try pairing().origin)
            XCTFail("expected failure")
        } catch {
            guard case .unreachable = PairingError.from(error) else { return XCTFail("meta failure keeps the code unspent: \(error)") }
        }
    }

    func testGeneralErrorsMapToPairingErrors() {
        XCTAssertEqual(PairingError.from(KindredAPIError.transport("offline")), .unreachable(detail: "offline"))
        XCTAssertEqual(PairingError.from(KindredAPIError.redirectRefused), .redirected)
        XCTAssertEqual(PairingError.from(KindredAPIError.notKindredServer), .notKindredServer)
        XCTAssertEqual(PairingError.from(KindredAPIError.unauthorized(nil)), .invalidResponse)
        XCTAssertEqual(PairingError.from(PairingError.codeRejected), .codeRejected)
    }

    func testIdentityMustMatchClaim() throws {
        let claim = try respond(200, #"{"token":"\#(token)","profile_id":"p-2","account_id":"\#(account)","login":"ada"}"#)
        let id = account.lowercased()
        XCTAssertTrue(claim.isConfirmed(by: IdentitySummary(serverAccountID: id, username: "Ada", activeProfileID: "p-2", activeProfileName: nil, legacy: false)))
        XCTAssertTrue(claim.isConfirmed(by: IdentitySummary(serverAccountID: id, username: "ada", activeProfileID: nil, activeProfileName: nil, legacy: false)))
        XCTAssertFalse(claim.isConfirmed(by: IdentitySummary(serverAccountID: UUID().uuidString.lowercased(), username: "ada", activeProfileID: "p-2", activeProfileName: nil, legacy: false)))
        XCTAssertFalse(claim.isConfirmed(by: IdentitySummary(serverAccountID: id, username: "bob", activeProfileID: "p-2", activeProfileName: nil, legacy: false)))
        XCTAssertFalse(claim.isConfirmed(by: IdentitySummary(serverAccountID: id, username: "ada", activeProfileID: "p-9", activeProfileName: nil, legacy: false)))
        XCTAssertFalse(claim.isConfirmed(by: IdentitySummary(serverAccountID: nil, username: "ada", activeProfileID: "p-2", activeProfileName: nil, legacy: false)))
        XCTAssertFalse(claim.isConfirmed(by: IdentitySummary(serverAccountID: id, username: "ada", activeProfileID: "p-2", activeProfileName: nil, legacy: true)))
    }

    func testDedupeBySameServerAndAccountOnly() throws {
        let box = try ServerAddress.normalize("box.example")
        let other = try ServerAddress.normalize("other.example")
        let id = account.lowercased()
        var paired = Account(origin: box, login: "ada"); paired.serverAccountID = id
        var sameIDElsewhere = Account(origin: other, login: "ada"); sameIDElsewhere.serverAccountID = id
        let legacy = Account(origin: box, login: "ada")
        var renamed = Account(origin: box, login: "old-name"); renamed.serverAccountID = id

        XCTAssertEqual(AccountGrouping.existing(in: [sameIDElsewhere, legacy, paired], origin: box, serverAccountID: id, login: "ada")?.id, paired.id)
        XCTAssertEqual(AccountGrouping.existing(in: [sameIDElsewhere, legacy], origin: box, serverAccountID: id, login: "ADA")?.id, legacy.id)
        XCTAssertEqual(AccountGrouping.existing(in: [renamed], origin: box, serverAccountID: id, login: "ada")?.id, renamed.id)
        XCTAssertNil(AccountGrouping.existing(in: [sameIDElsewhere], origin: box, serverAccountID: id, login: "ada"))
        var differentUser = Account(origin: box, login: "ada"); differentUser.serverAccountID = UUID().uuidString.lowercased()
        XCTAssertNil(AccountGrouping.existing(in: [differentUser], origin: box, serverAccountID: id, login: "ada"),
                     "a recreated server account with the same login is kept separate")
    }
}

/// Fails every request as if the connection dropped.
final class DroppingProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        client?.urlProtocol(self, didFailWithError: NSError(domain: NSURLErrorDomain, code: NSURLErrorNetworkConnectionLost))
    }
    override func stopLoading() {}
}
