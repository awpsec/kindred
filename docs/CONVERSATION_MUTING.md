# Conversation notification muting

Sidebar bot and conversation menus offer Mute conversation > For 1 hour,
For 24 hours, or Indefinitely. An active mute replaces this submenu with Unmute.

Bot mutes suppress notifications from that bot across conversations. Conversation
mutes suppress only that conversation, including shared server chats, for the
current profile. Other participants' settings are unchanged. Muting does not
stop tasks, discard messages, or mark unread messages as read. Existing global
and per-bot notification preferences still apply.

The server persists mute deadlines in the profile's notification_mutes setting.
Timed mutes expire by server time without a scheduler or an open desktop client.
Browser and native clients consume the filtered notification feed; filtered
batches advance their cursors normally instead of accumulating a delivery queue.
The attention response includes deadlines so other clients show the same menu
state. Zero clears the mute; -1 means indefinite. Only the three supported
durations and unmute are accepted by the authenticated endpoint.

Requires the matching updated server and UI; this source change does not deploy
or publish a release.
