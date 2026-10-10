import Foundation

/// Bounded speech operations carry no credentials or executable JavaScript.
public struct DictationCommand: Equatable, Sendable {
    public enum Action: String, Sendable { case status, context, start, stop, cancel, settings }
    public let action: Action
    public let documentID: String
    public let operationID: String?
    public let chatID: String?
    public let locale: String?

    public init?(body: Any) {
        guard let object = body as? [String: Any],
              let action = object["action"] as? String, let parsed = Action(rawValue: action),
              let document = object["documentID"] as? String, UUID(uuidString: document) != nil else { return nil }
        func identifier(_ key: String, maximum: Int) -> String? {
            guard let value = object[key] as? String, !value.isEmpty, value.utf8.count <= maximum,
                  value.unicodeScalars.allSatisfy({ $0.value > 0x20 && $0.value < 0x7F }) else { return nil }
            return value
        }
        let operation = identifier("operationID", maximum: 128)
        let chat = identifier("chatID", maximum: 160)
        if [.start, .stop, .cancel].contains(parsed), operation == nil || chat == nil { return nil }
        if let raw = object["chatID"], !(raw is NSNull), chat == nil { return nil }
        if let raw = object["operationID"], !(raw is NSNull), operation == nil { return nil }
        var locale: String?
        if let raw = object["locale"] {
            guard let value = raw as? String, !value.isEmpty, value.utf8.count <= 80,
                  value.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == "-" }) else { return nil }
            locale = value
        }
        self.action = parsed; documentID = document; operationID = operation; chatID = chat; self.locale = locale
    }
}

/// Generation fencing also applies while system permission prompts are pending.
public struct DictationOperation: Equatable, Sendable {
    public let documentID: String
    public let operationID: String
    public let chatID: String
    public let generation: UInt64
}

public struct DictationFence: Sendable {
    public private(set) var current: DictationOperation?
    public private(set) var generation: UInt64 = 0
    public private(set) var sequence: Int = 0
    public init() {}
    public mutating func begin(documentID: String, operationID: String, chatID: String) -> DictationOperation {
        invalidate()
        let next = DictationOperation(documentID: documentID, operationID: operationID, chatID: chatID, generation: generation)
        current = next
        return next
    }
    public func accepts(_ operation: DictationOperation) -> Bool { current == operation }
    public mutating func nextSequence(for operation: DictationOperation) -> Int? {
        guard accepts(operation) else { return nil }
        sequence += 1
        return sequence
    }
    public mutating func invalidate() { generation &+= 1; current = nil; sequence = 0 }
}

public enum WebDictation {
    /// Each document gets a fresh nonce; same-origin reloads cannot receive an
    /// earlier document's transcript. Availability is reconciled natively.
    public static func bootstrap(origin: ServerOrigin) -> String {
        """
        (function(){
          if(window.top!==window.self || location.origin!==\(WebBootstrap.javaScriptString(origin.serialized)))return;
          const freshUUID=()=>{
            const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
            const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
            return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
          };
          // Private HTTP origins have cryptographic randomness but omit this
          // secure-context convenience API. Preserve the native HTTPS method.
          if(typeof crypto.randomUUID!=='function')Object.defineProperty(crypto,'randomUUID',{value:freshUUID,configurable:true});
          const documentID=freshUUID();
          window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:false,recognizerAvailable:false,locale:'',documentID};
        })();
        """
    }
    public static func eventScript(origin: ServerOrigin) -> String {
        """
        if(window.top!==window.self || location.origin!==\(WebBootstrap.javaScriptString(origin.serialized)))return false;
        if(window.__KINDRED_IOS_DICTATION?.documentID!==payload.documentID)return false;
        window.dispatchEvent(new CustomEvent('kindred-ios-dictation',{detail:payload}));return true;
        """
    }
    public static func capabilityScript(origin: ServerOrigin) -> String {
        """
        if(window.top!==window.self || location.origin!==\(WebBootstrap.javaScriptString(origin.serialized)))return false;
        if(window.__KINDRED_IOS_DICTATION?.documentID!==payload.documentID)return false;
        window.__KINDRED_IOS_DICTATION={...window.__KINDRED_IOS_DICTATION,...payload};
        window.dispatchEvent(new CustomEvent('kindred-ios-dictation-capability',{detail:window.__KINDRED_IOS_DICTATION}));return true;
        """
    }
}

/// Nonce checks may complete out of order. Apply validated messages in receipt
/// order, while an already received newer context fences old starts immediately.
public struct DictationCommandQueue {
    public struct Ticket: Equatable {
        fileprivate let serial: UInt64
        fileprivate let generation: UInt64
        fileprivate let context: UInt64
    }
    private struct Pending { let ticket: Ticket; let command: DictationCommand; var valid: Bool? }
    private var pending: [Pending] = []
    private var serial: UInt64 = 0
    private var generation: UInt64 = 0
    private var context: UInt64 = 0
    public init() {}
    public mutating func enqueue(_ command: DictationCommand) -> Ticket? {
        guard pending.count < 32 else {
            // A dropped context must not leave an earlier pending start alive.
            invalidate()
            return nil
        }
        if command.action == .context { context &+= 1 }
        serial &+= 1
        let ticket = Ticket(serial: serial, generation: generation, context: context)
        pending.append(Pending(ticket: ticket, command: command, valid: nil))
        return ticket
    }
    public mutating func complete(_ ticket: Ticket, valid: Bool) -> [DictationCommand] {
        guard ticket.generation == generation,
              let index = pending.firstIndex(where: { $0.ticket == ticket }), pending[index].valid == nil else { return [] }
        pending[index].valid = valid
        var accepted: [DictationCommand] = []
        while let first = pending.first, let valid = first.valid {
            pending.removeFirst()
            guard valid else { continue }
            if first.command.action == .context || first.command.action == .start {
                guard first.ticket.context == context else { continue }
            }
            accepted.append(first.command)
        }
        return accepted
    }
    public mutating func invalidate() { generation &+= 1; pending.removeAll() }
}
