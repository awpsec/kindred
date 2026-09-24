# Archived bots

Settings → Archived lists archived bots and conversations. General settings also links there. Restore preserves a bot's identity, instructions, memory and history and returns it to the sidebar.

Permanent deletion is available only for archived bots, requires typing the current name, and is rejected while tasks, commands, enabled routines or unresolved collaborations remain. Database cleanup is transactional and follows foreign-key dependencies. Private runs, history, memory, routines and database-stored task artifacts are removed. Shared prose remains; deleted private artifact cards are replaced with a removal notice. Shared room membership is reconciled on the next room refresh.

Account connections, usage audit history, shared conversations and files on connected computers or VMs remain. SQLite can reuse the released pages; this does not promise immediate shrinkage of the database file on disk.

Validation: backend deletion/identity/active-work/isolation/integrity tests and browser settings tests for restore, cancellation, typed confirmation and empty state.
