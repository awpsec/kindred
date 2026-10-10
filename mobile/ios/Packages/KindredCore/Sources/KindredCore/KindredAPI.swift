import Foundation
import CoreFoundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum KindredAPIError: Error, Equatable, LocalizedError {
    /// The server's own `{"error": "..."}` explanation.
    case server(String)
    case unauthorized(String?)
    case notFound
    case redirectRefused
    case notKindredServer
    case invalidResponse
    case http(Int)
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .unauthorized(let message): return message ?? "Your session has ended. Sign in again."
        case .notFound: return "This server doesn't provide that feature."
        case .redirectRefused: return "The server tried to redirect a signed-in request, so Kindred stopped it."
        case .notKindredServer: return "That address didn't answer like a Kindred server."
        case .invalidResponse: return "The server sent a response Kindred couldn't read."
        case .http(let code): return "The server returned an error (\(code))."
        case .transport(let message): return message
        }
    }
}

public struct LoginResult: Equatable, Sendable {
    public let token: String
    public let profileID: String
}

/// `GET /identity/profiles` for the signed-in session.
public struct IdentitySummary: Equatable, Sendable {
    public let serverAccountID: String?
    public let username: String?
    public let activeProfileID: String?
    public let activeProfileName: String?
    public let legacy: Bool
    public let admin: Bool
    public let owner: Bool

    public init(serverAccountID: String?, username: String?, activeProfileID: String?,
                activeProfileName: String?, legacy: Bool, admin: Bool = false, owner: Bool = false) {
        self.serverAccountID = serverAccountID
        self.username = username
        self.activeProfileID = activeProfileID
        self.activeProfileName = activeProfileName
        self.legacy = legacy
        self.admin = !legacy && admin
        self.owner = !legacy && admin && owner
    }

    public static func parse(_ data: Data) throws -> IdentitySummary {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw KindredAPIError.invalidResponse
        }
        func flag(_ key: String) -> Bool {
            guard let value = object[key] as? NSNumber,
                  CFGetTypeID(value) == CFBooleanGetTypeID() else { return false }
            return value.boolValue
        }
        let active = object["active"] as? String
        let profiles = object["profiles"] as? [[String: Any]] ?? []
        let profile = profiles.first { ($0["id"] as? String) == active } ?? profiles.first { $0["active"] as? Bool == true }
        return IdentitySummary(
            serverAccountID: (object["account_id"] as? String).flatMap(PushPayload.canonicalUUID),
            username: (object["username"] as? String).map { String($0.prefix(80)) },
            activeProfileID: active.flatMap { ProfileIdentifier.isValid($0) ? $0 : nil },
            activeProfileName: (profile?["name"] as? String).map { String($0.prefix(80)) },
            legacy: flag("legacy"), admin: flag("admin"),
            owner: (object["role"] as? String) == "owner" && flag("owner_resolved")
        )
    }
}

/// Pure request builders. Credentialed requests never send cookies, never use
/// a cache, and carry no Origin header (the server only checks Origin when a
/// browser supplies one).
public enum KindredRequests {
    public static let timeout: TimeInterval = 30

    static func make(_ method: String, _ origin: ServerOrigin, _ path: String, token: String? = nil, body: Data? = nil) -> URLRequest {
        guard let url = origin.url(path: path) else { preconditionFailure("Request paths are fixed and absolute") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    static func json(_ object: [String: String]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(object)
    }

    static func installationPath(_ installationID: UUID) -> String {
        "/api/mobile/devices/" + installationID.uuidString.lowercased()
    }

    public static func meta(origin: ServerOrigin) -> URLRequest {
        make("GET", origin, "/identity/meta")
    }

    /// `profileID` re-opens a saved account's workspace; without it the server
    /// opens the account's first profile.
    public static func login(origin: ServerOrigin, login: String, password: String, profileID: String? = nil) throws -> URLRequest {
        var body = ["login": login, "password": password]
        if let profileID, ProfileIdentifier.isValid(profileID) { body["profile_id"] = profileID }
        return make("POST", origin, "/identity/login", body: try json(body))
    }

    public static func profiles(origin: ServerOrigin, token: String) -> URLRequest {
        make("GET", origin, "/identity/profiles", token: token)
    }

    public static func switchProfile(origin: ServerOrigin, token: String, profileID: String) throws -> URLRequest {
        guard KindredRoutes.isValidChatID(profileID) else { throw KindredAPIError.invalidResponse }
        return make("POST", origin, "/identity/switch", token: token, body: try json(["profile_id":profileID]))
    }

    public static func logout(origin: ServerOrigin, token: String) -> URLRequest {
        make("POST", origin, "/identity/logout", token: token, body: Data("{}".utf8))
    }

    public static func pushStatus(origin: ServerOrigin, token: String, installationID: UUID?) -> URLRequest {
        var path = "/api/mobile/push-status"
        if let installationID { path += "?installation_uuid=" + installationID.uuidString.lowercased() }
        return make("GET", origin, path, token: token)
    }

    public static func registerDevice(origin: ServerOrigin, token: String, installationID: UUID, deviceToken: String,
                                      environment: APNsEnvironment, serverAccountID: String) throws -> URLRequest {
        let body = try json([
            "platform": "ios",
            "token": deviceToken,
            "environment": environment.rawValue,
            "account_id": serverAccountID,
        ])
        return make("PUT", origin, installationPath(installationID), token: token, body: body)
    }

    public static func unregisterDevice(origin: ServerOrigin, token: String, installationID: UUID) -> URLRequest {
        make("DELETE", origin, installationPath(installationID), token: token)
    }
}

/// Native HTTP for sign-in and device registration. It refuses every redirect:
/// a bearer token or password is only ever sent to the origin it was saved for.
public final class KindredAPIClient: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private var session: URLSession!

    public init(configuration: URLSessionConfiguration = KindredAPIClient.defaultConfiguration()) {
        super.init()
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    public static func defaultConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = KindredRequests.timeout
        return configuration
    }

    public func invalidate() {
        session.invalidateAndCancel()
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    // MARK: Endpoints

    /// Confirms the address is a Kindred server before any password is sent.
    public func verifyKindredServer(_ origin: ServerOrigin) async throws {
        let data: Data
        do {
            data = try await checked(KindredRequests.meta(origin: origin))
        } catch KindredAPIError.notFound {
            throw KindredAPIError.notKindredServer
        } catch KindredAPIError.http(_) {
            throw KindredAPIError.notKindredServer
        }
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              object["profiles"] as? Bool == true else { throw KindredAPIError.notKindredServer }
    }

    public func login(origin: ServerOrigin, login: String, password: String, profileID: String? = nil) async throws -> LoginResult {
        let data = try await checked(try KindredRequests.login(origin: origin, login: login, password: password, profileID: profileID))
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let token = object["token"] as? String, SessionToken.isValid(token),
              let profile = object["profile_id"] as? String, ProfileIdentifier.isValid(profile) else {
            throw KindredAPIError.invalidResponse
        }
        return LoginResult(token: token, profileID: profile)
    }

    public func switchProfile(origin: ServerOrigin, token: String, profileID: String) async throws -> LoginResult {
        let data = try await checked(try KindredRequests.switchProfile(origin: origin, token: token, profileID: profileID))
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String:Any],
              let next = object["token"] as? String, SessionToken.isValid(next),
              let profile = object["profile_id"] as? String, profile == profileID else { throw KindredAPIError.invalidResponse }
        return LoginResult(token:next, profileID:profile)
    }

    public func identity(origin: ServerOrigin, token: String) async throws -> IdentitySummary {
        let data = try await checked(KindredRequests.profiles(origin: origin, token: token))
        return try IdentitySummary.parse(data)
    }

    public func logout(origin: ServerOrigin, token: String) async throws {
        _ = try await checked(KindredRequests.logout(origin: origin, token: token))
    }

    /// 404 means the server predates mobile push.
    public func pushStatus(origin: ServerOrigin, token: String, installationID: UUID?) async throws -> (status: PushServerStatus, registered: Bool?) {
        do {
            let data = try await checked(KindredRequests.pushStatus(origin: origin, token: token, installationID: installationID))
            return PushServerStatus.parse(data)
        } catch KindredAPIError.notFound {
            return (.unsupported, nil)
        }
    }

    /// Returns whether the server reports delivery as enabled for iOS.
    @discardableResult
    public func registerDevice(origin: ServerOrigin, token: String, installationID: UUID, deviceToken: String,
                               environment: APNsEnvironment, serverAccountID: String) async throws -> Bool {
        let request = try KindredRequests.registerDevice(origin: origin, token: token, installationID: installationID,
                                                         deviceToken: deviceToken, environment: environment,
                                                         serverAccountID: serverAccountID)
        let data = try await checked(request)
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              object["registered"] as? Bool == true else { throw KindredAPIError.invalidResponse }
        return object["delivery_enabled"] as? Bool ?? false
    }

    /// Succeeds only when the server confirms the registration no longer exists
    /// (`{"removed": bool}`; false means it was already gone).
    public func unregisterDevice(origin: ServerOrigin, token: String, installationID: UUID) async throws {
        let data = try await checked(KindredRequests.unregisterDevice(origin: origin, token: token, installationID: installationID))
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              object["removed"] is Bool else { throw KindredAPIError.invalidResponse }
    }

    // MARK: Transport

    func checked(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await send(request)
        try KindredAPIClient.validate(request: request, response: response, data: data)
        return data
    }

    /// Status and origin checks shared by every call; separated for tests.
    static func validate(request: URLRequest, response: HTTPURLResponse, data: Data) throws {
        guard let requestURL = request.url, let origin = ServerOrigin(url: requestURL) else {
            throw KindredAPIError.invalidResponse
        }
        guard origin.matches(response.url ?? requestURL) else { throw KindredAPIError.redirectRefused }
        switch response.statusCode {
        case 200..<300:
            return
        case 300..<400:
            throw KindredAPIError.redirectRefused
        case 401:
            throw KindredAPIError.unauthorized(serverMessage(data))
        case 404:
            throw KindredAPIError.notFound
        default:
            if let message = serverMessage(data) { throw KindredAPIError.server(message) }
            throw KindredAPIError.http(response.statusCode)
        }
    }

    static func serverMessage(_ data: Data) -> String? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let message = object["error"] as? String else { return nil }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(300))
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>) in
            let task = session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: KindredAPIError.transport(KindredAPIClient.describe(error)))
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    continuation.resume(throwing: KindredAPIError.invalidResponse)
                    return
                }
                continuation.resume(returning: (data ?? Data(), http))
            }
            task.resume()
        }
    }

    public static func describe(_ error: Error) -> String {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain else { return error.localizedDescription }
        switch error.code {
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            return "You're offline. Check your connection and try again."
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return "Kindred couldn't find that server."
        case NSURLErrorCannotConnectToHost, NSURLErrorTimedOut:
            return "The server didn't respond. Check the address and try again."
        case NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
             NSURLErrorSecureConnectionFailed, NSURLErrorClientCertificateRejected:
            return "The server's HTTPS certificate couldn't be verified, so Kindred didn't connect."
        case NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return "Kindred for iOS connects over HTTPS only."
        default:
            return error.localizedDescription
        }
    }
}
