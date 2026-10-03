import KindredCore
import SwiftUI

/// Native sign-in: choose a saved server or enter a new HTTPS address, then
/// username and password. The password goes only to `POST /identity/login` on
/// that exact origin and is never stored.
@MainActor
struct AddAccountSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let prefill: AccountPrefill

    @State private var choice: ServerChoice = .new
    @State private var address = ""
    @State private var login = ""
    @State private var password = ""
    @State private var working = false
    @State private var errorMessage: String?
    @State private var prepared = false
    @FocusState private var focus: Field?

    private enum Field: Hashable { case address, login, password }

    enum ServerChoice: Hashable {
        case saved(ServerOrigin)
        case new
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if !model.savedOrigins.isEmpty {
                        Picker("Server", selection: $choice) {
                            ForEach(model.savedOrigins, id: \.self) { origin in
                                Text(origin.displayName).tag(ServerChoice.saved(origin))
                            }
                            Text("New Server…").tag(ServerChoice.new)
                        }
                    }
                    if choice == .new {
                        TextField("kindred.example.com", text: $address)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .address)
                            .submitLabel(.next)
                            .onSubmit { focus = .login }
                    }
                } header: {
                    Text("Server")
                } footer: {
                    Text("Kindred connects over HTTPS only. Enter the server address without a path.")
                }

                Section("Account") {
                    TextField("Username", text: $login)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .login)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: submit) {
                        HStack {
                            Spacer()
                            if working {
                                ProgressView()
                            } else {
                                Text("Sign In").fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
            .navigationTitle(prefill.origin == nil || prefill.login.isEmpty ? "Add Account" : "Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(working)
                }
            }
            .interactiveDismissDisabled(working)
            .disabled(working)
            .onAppear(perform: prepare)
        }
        .tint(.primary)
    }

    private var canSubmit: Bool {
        guard !working, !login.trimmingCharacters(in: .whitespaces).isEmpty, !password.isEmpty else { return false }
        if choice == .new { return !address.trimmingCharacters(in: .whitespaces).isEmpty }
        return true
    }

    private func prepare() {
        guard !prepared else { return }
        prepared = true
        if let origin = prefill.origin, model.savedOrigins.contains(origin) {
            choice = .saved(origin)
        } else if let origin = prefill.origin {
            choice = .new
            address = origin.displayName
        } else if let first = model.savedOrigins.first, prefill.login.isEmpty, !model.accounts.isEmpty {
            choice = .saved(first)
        }
        login = prefill.login
        focus = choice == .new ? .address : (login.isEmpty ? .login : .password)
    }

    private func submit() {
        guard canSubmit else { return }
        let origin: ServerOrigin
        switch choice {
        case .saved(let saved):
            origin = saved
        case .new:
            do {
                origin = try ServerAddress.normalize(address)
            } catch {
                errorMessage = error.localizedDescription
                focus = .address
                return
            }
        }
        working = true
        errorMessage = nil
        let login = self.login
        let password = self.password
        Task { @MainActor in
            do {
                try await model.signIn(origin: origin, login: login, password: password)
                self.password = ""
                working = false
                model.sheet = nil
                dismiss()
            } catch {
                working = false
                errorMessage = error.localizedDescription
                focus = .password
            }
        }
    }
}
