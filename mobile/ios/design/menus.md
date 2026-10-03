# iOS action menu audit

Kindred's first-party action menus use UIKit presentation inside the iOS app.
Desktop hover panels must not become visible in the app. This is bundled with
the companion, including when connected to an older server.

| Surface | iOS presentation |
| --- | --- |
| Composer +: Attach files | Native action sheet; original file chooser callback; teaching is desktop only |
| Conversation list +: New bot / New chat | Native action sheet |
| Library More: Artifacts / Marketplace | Native action sheet |
| Computer screen picker | Native action sheet with selected screen marked |
| Bot avatar customization | Native Shape / Color submenus with selected choices marked |
| Artifact +: document / sheet / slides / app / folder | Native action sheet |
| Artifact context actions: pin / rename / move / details | UIKit press context menu; native action sheet for keyboard/context-event entry; desktop library pinning omitted |
| Delivered file More: preview / source link / repeat download | Native action sheet preserving available actions |
| Conversation press menus and mute durations | Existing UIKit context menus |
| Message reactions / reply / copy | Existing UIKit context menus; queued edit omitted on iOS |
| Artifact source/inline card editing | Omitted on iOS; previews and metadata remain available |
| Form selects, including searchable desktop model selectors | WebKit's native iOS select picker; themed duplicate suppressed |
| Desktop identity/usage hover flyouts | Desktop identity entry is hidden; account/settings entry uses the existing mobile sheet |
| Desktop dictation model picker | Hidden; iPhone keyboard owns dictation |

`MobileLayout.js` observes menu opening and retains opaque references to the
server's action buttons. `MobileLayout.css` suppresses desktop presentation
before a frame can paint. `WebSession` validates bounded menu data from the
trusted main frame, presents UIKit action sheets, and returns only the chosen
action ID. Changing page/conversation, removing a source control, cancellation,
or consuming a menu invalidates its actions. No server deployment is required.

Future first-party action menus must have `role="menu"` and accessible button
labels so this adapter can collect their current actions. Unlabelled legacy
menus are explicitly covered by the selector inventory. Autocomplete while
typing and embedded document/app content are separate content interfaces.

Verification: the WebKit iOS layout fixture exercises composer attachment,
new conversation, library navigation, artifact creation/context actions,
avatar groups, screen choice, cancellation, and stale actions. Simulator-hosted
tests cover native sheets, nested/selected/disabled/destructive choices,
appearance, and malformed bridge data. Native gesture timing on a physical
iPhone remains a device acceptance check.
