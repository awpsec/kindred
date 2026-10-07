# iOS shared navigation and adaptive layout

The iOS bridge advertises route eligibility through `kindredNavigation` with a target and numeric revision. The native recognizer calls `__KINDRED_EDGE_BACK` using a gesture UUID, the same revision and a current viewport start point. The shared page checks dialogs, menus, request forms, selections and horizontal scrollers. A transparent 20-pixel computer-edge shield prevents canvas input there. Other platforms keep their existing navigation.

Chat back shows the list; computer back hides its retained pane. Neither sends input nor returns control. Reopening the same computer reuses its connection. Route changes and geometry changes cancel the interactive transition. Reduced motion uses opacity feedback.

Pane fit uses the live layout viewport and current message text size. Keep at least 32 em for the chat and at least 360 pixels for a side computer. Collapse the 300 pixel list column first; if the chat still cannot fit beside the computer, use the computer overlay. The list stays available through the existing menu. Height below 480 uses the compact header and composer. These provisional fit choices need local native verification. Visual viewport keyboard shrink does not change classes. When the native window remains unchanged, a shortened web host with an editor focused retains its class. Native geometry describes a host already inside the system safe area; the web page does not add those insets again.

During geometry changes, computer input remains blocked until the noVNC viewport scale matches the actual VNC canvas rectangle and that rectangle is stable. Decorative glass canvases do not supply input geometry. There is no timeout that permits stale coordinates. Native gestures and actual keyboard/safe-area behavior need the local Mac and phone checklist in mobile/ios/README.md.

The installed version label alone cannot diagnose a QR failure. Older HTTPS-only clients reject private HTTP links; HTTPS links retain their previous shape. Use a disposable pairing link and record the visible failure stage, without recording QR pixels, codes or tokens. Shared/server pairing policy is unchanged by this navigation work.
