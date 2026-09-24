# Floating composer read receipts

The visibility hit test now samples exposed conversation space above the floating composer. Previously it sampled the bottom center of the history, where the composer intercepted the hit; that prevented saving read receipts and left sidebar unread dots stuck.

Focus, latest-message-loaded, scroll-to-latest, modal and expanded-computer guards remain. Local receipt cursors still prevent stale polling responses from bringing the dot back.

The regression fails against the previous source (zero receipts), and passes for local/shared groups in Chromium and WebKit after the change. The existing long unread-history opening test also passes without acknowledging unseen pages.
