# Bot center and navigation

Settings, Marketplace and the workspace Artifacts library are available from the account menu. The sidebar starts with Search and New. Search opens a keyboard-accessible palette of current bots, conversations and actions; it can match loaded recent run text, but does not claim to search the entire server history. Ctrl/Cmd K opens it, arrows select, Enter opens, Ctrl/Cmd 1–9 selects a visible result, and Escape closes it. Existing dialogs keep their keyboard focus.

The conversation header opens the bot center. Details retains bot preferences, connections, skills and the existing routine editor. Library reads chat history independently of the transcript window, combines user uploads, bot files and workspace artifacts, and offers explicit earlier-file loading. It uses the server history cursor rather than numeric sequence ordering. Image thumbnails and hover previews are frozen canvases; hovering does not play GIFs or videos. Opening a file uses the existing media/document renderer and authenticated download paths.

Computer keeps the original screen controls, takeover, resizing and expanded view. Switching tabs retains the same connected screen for that bot. Switching bots or chats, changing accounts, or closing the center clears retained screen ownership. The browser tests use a fake RFB connection to verify this lifecycle; native remote-screen acceptance remains separate.

The neutral shell uses filled selections and subtle separators, with keyboard focus indication retained. Bot rows and appearance previews use bounded pointer gaze; touch, reduced motion, hidden and offscreen behavior remain respected. Rest is visually neutral, without a sleeping face or loop.

The appearance picker offers 15 shapes: blob, cloud, square, sparkle, clover, heart, flower, teardrop, tablet, wedge, house, star, hex, gem and pebble. The full stored catalog remains valid, preserving older bot identities. Picker previews remain neutral and static; live activity expressions remain dynamic.

The implementation adapts observations from the owner-supplied Grok Bot artifact and screenshots. The release evidence contains the REA source hashes, evidence IDs and scoped static-analysis findings. No live Grok behavior is claimed solely from source inspection.

Browser checks: navigation palette, actual shell, bot-center library/paging, actual media opening, retained connection ownership, picker persistence/responsiveness, runtime motion and long-job regression. Before publication, verify native Linux X11/Wayland, macOS and Windows behavior, matching server/client assets, signed update packages and managed deployment health.
