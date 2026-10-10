# Accounts and the fixed Owner

Account settings can change your username. Usernames are trimmed, stored in lowercase, and use 1–80 ASCII letters, numbers, dots, underscores, hyphens or @. Account IDs, profile IDs, password, sessions, links, private data and provider connections remain unchanged. The old username stops working for new sign-ins. The form sends its expected old username so simultaneous edits fail rather than overwrite each other.

The first account registered on a new server is recorded as its fixed Owner in the same transaction. This also covers a new, authenticated claim of the legacy workspace. Owner is an administrator. Only Owner can change other accounts between User and Admin. Changes check current authority after obtaining the registry write lock. Demoted sessions keep their workspace access but lose administrative access immediately. Disabled accounts keep their role. The Owner cannot be downgraded, disabled or removed. There is no Owner-transfer feature.

## Existing servers

Older registries did not store an immutable original-Owner marker. Creation timestamps, row order, current login, the number of administrators, and a restored legacy-profile association do not establish provenance after restore/import or historical host edits. They are not used to select an Owner automatically. Until confirmed, ordinary administration continues, but role changes and disabling/removing administrators are blocked. User accounts can still be managed.

A trusted operator must identify the original account from their own reliable installation records before confirming it. Use the configuration and working directory actually used by that server:

```sh
kindred --config /path/to/server.toml owner status
kindred --config /path/to/server.toml owner confirm --account-id EXACT-ID --confirm-username EXACT-CURRENT-USERNAME
```

`status` prints only account IDs, names and role/disabled flags, never passwords, tokens or provider credentials. Confirmation requires an enabled administrator, an exact current username, and no removal in progress. It is idempotent for the same account. Once fixed, another account cannot replace it. The command opens only the existing config-selected registry; it does not create profiles, provision computers or use provider/legacy credentials. No live assignment is part of source testing.

## API compatibility

Authenticated `POST /identity/account` accepts `{account_id,expected_username,username}` for the bearer account only. Success returns `{account_id,username,admin,role,owner_resolved}`. Foreign account edits return 403; taken names and stale edits return 409. Validation errors return 400. `/identity/profiles` retains all existing fields and adds `account_management:true`, `role` and `owner_resolved`. Older clients can ignore those fields.

`POST /identity/admin` action `role` requires `{user_id,role:"user"|"admin",expected_role}` and confirmed Owner authority. There is no `owner` option. Non-owner role writes return 403; stale roles return 409. Admin reads include each user's role, `owner_resolved` and `can_manage_roles`. Other administrator actions keep their authorization, with fixed-Owner and unresolved-administrator protection.

The shared account form submits only changed fields. If a combined username/profile-name edit partially succeeds, it explicitly reports that the username changed and retains the remaining draft for retry. Native account caches keep their immutable account key and refresh the display username from identity. Legacy/older servers without `account_management` retain a read-only username field and existing profile-name editing.
