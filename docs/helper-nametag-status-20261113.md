# Helper collaboration status

The desktop nametag previously excluded delegated runs located in the helper's own direct chat. It also only derived incoming collaboration from run metadata, so a pending wait without that metadata fell back to the old transcript row.

Both cases now use the existing nametag status component. Known delegated work retains its Working/Queued for label and interrupts the helper run. Pending incoming waits without run metadata show the requester waiting on the helper, preserving the old parent-run cancellation behavior. Existing requester status, component animation, hover-only interrupt control, mobile/native fallback and approval cards are unchanged.

Validation: `test-nametag-helper-status.cjs` and `test-nametag-status.cjs` passed in Chromium and WebKit. These cover both sides, switching and reload, incoming waits without metadata, delegation in the helper DM, no visible duplicate transcript status, cancellation targets, terminal clearing, compact/mobile fallback, keyboard controls, reduced motion, title sizing and pane opening.

This source follow-up is separate from the frozen 0.90.6 packages. It has not been released or deployed.
