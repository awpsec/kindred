import KindredCore
import SwiftUI
import UIKit

/// Saved accounts grouped by server, with the current account at the top.
/// Adding an account always opens the separate native sign-in sheet.
@MainActor
struct AccountsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [UUID] = []
    @State private var adding: AccountPrefill?
    @State private var pairing: PairingRequest?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let current = model.activeAccount {
                    Section {
                        CurrentAccountHeader(account: current, signedIn: model.isSignedIn(current.id))
                            .listRowInsets(EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16))
                    }
                }
                ForEach(model.groups) { group in
                    Section {
                        ForEach(group.accounts) { account in
                            AccountRow(
                                account: account,
                                isActive: account.id == model.activeAccountID,
                                isSignedIn: model.isSignedIn(account.id),
                                select: { choose(account) },
                                details: { path.append(account.id) }
                            )
                        }
                        Button {
                            adding = AccountPrefill(origin: group.origin)
                        } label: {
                            Label("Add Account on This Server", systemImage: "plus")
                                .font(.subheadline)
                        }
                    } header: {
                        ServerHeader(origin: group.origin, count: group.accounts.count)
                    }
                }
                if model.accounts.isEmpty {
                    ContentUnavailableView {
                        Label("No Accounts", systemImage: "person.crop.circle.badge.plus")
                    } description: {
                        Text("Add your Kindred server and sign in.")
                    } actions: {
                        Button("Scan Pairing Code") { pairing = PairingRequest() }
                            .buttonStyle(.borderedProminent)
                        Button("Sign In with Password") { adding = AccountPrefill() }
                    }
                    .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Accounts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button {
                            pairing = PairingRequest()
                        } label: {
                            Label("Scan Pairing Code", systemImage: "qrcode.viewfinder")
                        }
                        Button {
                            adding = AccountPrefill()
                        } label: {
                            Label("Sign In with Password", systemImage: "person.badge.key")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add Account")
                }
            }
            .navigationDestination(for: UUID.self) { id in
                AccountDetailView(accountID: id) {
                    path.removeAll()
                }
            }
            .sheet(item: $adding) { prefill in
                AddAccountSheet(prefill: prefill)
                    .environment(model)
            }
            .sheet(item: $pairing) { request in
                PairDeviceSheet(request: request)
                    .environment(model)
            }
        }
        .task { await model.refreshAccountIdentities() }
    }

    private func choose(_ account: Account) {
        model.activate(account.id)
        if model.isSignedIn(account.id) {
            dismiss()
        } else {
            adding = AccountPrefill(origin: account.origin, login: account.login)
        }
    }
}

@MainActor
private struct CurrentAccountHeader: View {
    let account: Account
    let signedIn: Bool

    var body: some View {
        HStack(spacing: 14) {
            AccountAvatar(account: account, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(account.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(account.login)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Circle()
                        .fill(signedIn ? Color.green : Color.secondary)
                        .frame(width: 7, height: 7)
                    Text(signedIn ? account.origin.displayName : "Signed out · \(account.origin.displayName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

@MainActor
private struct ServerHeader: View {
    let origin: ServerOrigin
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "server.rack")
                .foregroundStyle(Theme.accent)
            Text(origin.displayName)
                .textCase(nil)
                .lineLimit(1)
            Spacer()
            Text(count == 1 ? "1 account" : "\(count) accounts")
                .textCase(nil)
                .foregroundStyle(.secondary)
        }
        .font(.footnote.weight(.medium))
    }
}

@MainActor
private struct AccountRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var titleCapHeight: CGFloat = UIFont.preferredFont(
        forTextStyle: .body, compatibleWith: UITraitCollection(preferredContentSizeCategory: .large)).capHeight
    let account: Account
    let isActive: Bool
    let isSignedIn: Bool
    let select: () -> Void
    let details: () -> Void

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            accessibilityRow
        } else {
            standardRow
        }
    }

    private var standardRow: some View {
        HStack(spacing: 12) {
            Button(action: select) {
                HStack(spacing: 12) {
                    AccountAvatar(account: account, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(account.title)
                                .font(.body.weight(.medium))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            if isSignedIn, account.administrativeRole != nil {
                                AdministratorBadge()
                                    .accessibilityHidden(true)
                                    .fixedSize()
                                    .layoutPriority(1)
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(account.title + (isSignedIn ? account.administrativeRole.map { ", " + $0.accessibilityLabel } ?? "" : ""))
                        Text(subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if case .registered = account.push.state {
                        Image(systemName: "bell.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Notifications on")
                    }
                    if isActive {
                        Image(systemName: "checkmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.accent)
                            .accessibilityLabel("Current account")
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button(action: details) {
                Image(systemName: "info.circle")
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Theme.accent)
            .accessibilityLabel("Details for \(account.title)")
        }
        .padding(.vertical, 2)
    }

    /// At accessibility sizes the status and Details controls get their own
    /// line, leaving the account name the full available text width.
    private var accessibilityRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: select) {
                HStack(alignment: .top, spacing: 12) {
                    AccountAvatar(account: account, size: 36)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(account.title)
                                .font(.body.weight(.medium))
                                .foregroundStyle(.primary)
                                .lineLimit(3)
                                .fixedSize(horizontal: false, vertical: true)
                                .layoutPriority(1)
                            if isSignedIn, account.administrativeRole != nil {
                                AdministratorBadge()
                                    .accessibilityHidden(true)
                                    .fixedSize()
                                    .alignmentGuide(.firstTextBaseline) { dimensions in
                                        // Centre the capped badge on the title's first
                                        // capital line, rather than the whole wrapped title.
                                        dimensions.height / 2 + titleCapHeight / 2
                                    }
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(account.title + (isSignedIn ? account.administrativeRole.map { ", " + $0.accessibilityLabel } ?? "" : ""))
                        Text(subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            HStack(spacing: 16) {
                if case .registered = account.push.state {
                    Image(systemName: "bell.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Notifications on")
                }
                if isActive {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                        .accessibilityLabel("Current account")
                }
                Spacer(minLength: 8)
                Button(action: details) {
                    Image(systemName: "info.circle")
                        .font(.title3)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.borderless)
                .foregroundStyle(Theme.accent)
                .accessibilityLabel("Details for \(account.title)")
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        if !isSignedIn { return "Signed out" }
        if account.title != account.login { return account.login }
        return "Signed in"
    }
}

/// Informational role marker; server authorization never depends on this cache.
private struct AdministratorBadge: View {
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 18
    @ScaledMetric(relativeTo: .body) private var glyph: CGFloat = 12

    var body: some View {
        Text("A")
            .font(.system(size: min(glyph, 15), weight: .bold))
            .foregroundStyle(.white)
            .frame(width: min(side, 22), height: min(side, 22))
            .background(Color(uiColor: .systemBlue), in: RoundedRectangle(cornerRadius: 4))
    }
}
