# Channel references and bot navigation

Group display names use lowercase, hyphen-separated channel handles with a # prefix. Stored titles and conversation IDs remain intact; the sidebar, pinned labels, header and references share the same formatter. Direct person conversations retain their normal name. Duplicate handles receive an ID suffix rather than resolving a reference to an arbitrary chat.

Typing # offers accessible buttons in the existing mention popup. Arrow keys select, Enter/Tab accepts and Escape dismisses. Selected channel chips serialize as #channel-name and are excluded from the bot-recipient list. Existing @bot chips remain supported. Channel and owned-bot references in message prose support click and keyboard navigation; composer chips remain editing tokens. Code blocks, inline code and existing links are not rewritten. References to another account's bot do not open an unrelated local DM.

The handoff bubble's separate 12px override was removed so it uses the same text size as ordinary message bubbles.

Browser tests cover suggestions, serialization, destination navigation, duplicate names, code preservation, equal handoff/ordinary font sizes, and existing shared-chat workflows. These are UI changes and require updated desktop resources or the updated hosted UI.
