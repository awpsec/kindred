import Foundation
import WebKit
import CryptoKit
import KindredCore

/// Authenticated deliverables only. The page supplies an ID, never a URL or path.
/// A saved copy and its index stay on this device; nothing enters account sync.
@MainActor
final class NativeChatFiles: NSObject, WKDownloadDelegate {
    struct Record: Codable { let id: String; let scope: String; let name: String }
    private struct Transfer {
        let id: String; let scope: String; let receipt: String
        let progress: ([String: Any]) -> Void
        let completion: (Result<String, Error>) -> Void
        var destination: URL?
        var observation: NSKeyValueObservation?
        var lastProgress: TimeInterval = 0
    }
    private let root: URL
    private var records: [String: Record] = [:]
    private var transfers: [ObjectIdentifier: Transfer] = [:]
    private var starting = Set<String>()
    init(account: UUID, directory: URL? = nil) {
        root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ChatDownloads", isDirectory: true).appendingPathComponent(account.uuidString, isDirectory: true)
        super.init()
        if let data = try? Data(contentsOf: root.appendingPathComponent("index.json")), data.count < 1024 * 1024,
           let saved = try? JSONDecoder().decode([String: Record].self, from: data) { records = saved }
    }
    static func scope(origin: String, token: String) -> String {
        SHA256.hash(data: Data((origin + "\n" + token).utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func file(_ receipt: String, scope: String) -> URL? {
        guard UUID(uuidString: receipt) != nil, let record = records[receipt], record.scope == scope,
              record.name == DownloadNaming.safeFilename(record.name) else { return nil }
        let url = root.appendingPathComponent(receipt, isDirectory: true).appendingPathComponent(record.name)
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]),
              values.isRegularFile == true, values.isSymbolicLink != true else { return nil }
        return url
    }
    func lookup(id: String, scope: String) -> String? {
        records.first { key, value in value.id == id && value.scope == scope && file(key, scope: scope) != nil }?.key
    }
    func reveal(receipt: String, scope: String) throws -> URL {
        guard let file = file(receipt, scope: scope) else { throw failure("This download was moved or removed. Download it again.") }
        return file
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "KindredDownload", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func save(id: String, scope: String, request: URLRequest, webView: WKWebView,
              progress: @escaping ([String: Any]) -> Void, completion: @escaping (Result<String, Error>) -> Void) {
        let key = scope + ":" + id
        guard starting.count + transfers.count < 4, !starting.contains(key),
              !transfers.values.contains(where: { $0.id == id && $0.scope == scope }) else {
            completion(.failure(failure("This file is already downloading. Please wait."))); return
        }
        starting.insert(key)
        webView.startDownload(using: request) { [weak self] download in
            guard let self else { download.cancel(nil); return }
            self.starting.remove(key)
            let identity = ObjectIdentifier(download)
            self.transfers[identity] = Transfer(id: id, scope: scope, receipt: UUID().uuidString,
                progress: progress, completion: completion)
            download.delegate = self
            self.transfers[identity]?.observation = download.progress.observe(\.completedUnitCount) { [weak self, weak download] _, _ in
                Task { @MainActor in
                    guard let self, let download, let transfer = self.transfers[identity] else { return }
                    let value = download.progress
                    if value.completedUnitCount > 8 * 1024 * 1024 { self.fail(download, error: self.failure("File exceeds the chat download limit")); download.cancel(nil); return }
                    let now = ProcessInfo.processInfo.systemUptime
                    guard now - transfer.lastProgress >= 0.08 else { return }
                    self.transfers[identity]?.lastProgress = now
                    transfer.progress(["received": value.completedUnitCount, "total": value.totalUnitCount > 0 ? value.totalUnitCount as Any : NSNull()])
                }
            }
        }
    }
    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
        // The endpoint is fixed and authenticated; never forward credentials.
        decisionHandler(.cancel)
        fail(download, error: failure("The server redirected this file. Reconnect and try again."))
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        guard let transfer = transfers[ObjectIdentifier(download)], let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode), response.expectedContentLength <= 8 * 1024 * 1024 else {
            completionHandler(nil); fail(download, error: failure("The file could not be downloaded. Try again.")); return
        }
        do {
            let folder = root.appendingPathComponent(transfer.receipt, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var localRoot = root
            try localRoot.setResourceValues(values)
            let file = folder.appendingPathComponent(DownloadNaming.safeFilename(suggestedFilename))
            transfers[ObjectIdentifier(download)]?.destination = file
            completionHandler(file)
        } catch { completionHandler(nil); fail(download, error: error) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let transfer = transfers.removeValue(forKey: ObjectIdentifier(download)), let file = transfer.destination else { return }
        transfer.observation?.invalidate()
        do {
            let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 8 * 1024 * 1024 else { throw failure("File exceeds the chat download limit") }
            records = records.filter { fileKey, value in self.file(fileKey, scope: value.scope) != nil && !(value.id == transfer.id && value.scope == transfer.scope) }
            if records.count >= 2048, let key = records.keys.first { records.removeValue(forKey: key) }
            records[transfer.receipt] = Record(id: transfer.id, scope: transfer.scope, name: file.lastPathComponent)
            try JSONEncoder().encode(records).write(to: root.appendingPathComponent("index.json"), options: .atomic)
            transfer.completion(.success(transfer.receipt))
        } catch { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()); transfer.completion(.failure(error)) }
    }
    private func fail(_ download: WKDownload, error: Error) {
        guard let transfer = transfers.removeValue(forKey: ObjectIdentifier(download)) else { return }
        transfer.observation?.invalidate()
        if let file = transfer.destination { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        transfer.completion(.failure(error))
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { fail(download, error: error) }
}
