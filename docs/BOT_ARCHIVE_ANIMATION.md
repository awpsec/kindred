# Bot archive animation

After the server confirms a bot archive, its visible sidebar avatar uses the same silhouette interpolation as its computer/hammer states to become a coffin in its own color. Once the morph settles, a perspective-projected lid and six shaded side walls retain visible thickness as it reclines backward into a horizontal pose, pauses, and lowers behind a clipped ground line before the sidebar entry collapses. The effect lasts about 2.3 seconds and applies to ordinary and pinned bot entries.

Sidebar reconciliation pauses during the effect so polling cannot remove the row midway. The server request still happens first: validation or save failures do not play a successful archive animation. Reduced-motion preferences and hidden documents skip the effect. Avatar animations are cancelled and the character returns to its idle shape after the sequence so the cached character renders normally if the bot is restored. Archive/restore semantics are unchanged.

Browser regression coverage: successful archive, polling during animation, restored avatar visibility, server rejection and reduced motion. Preview frames come from the actual application UI fixture.
