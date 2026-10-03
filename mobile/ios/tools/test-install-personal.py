"""Exercise the installer's source gate against real, disposable Git repos."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install-personal.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class SourceParityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.remote = root / "remote.git"
        self.repo = root / "checkout"
        self.git(root, "init", "--bare", str(self.remote))
        self.git(root, "clone", str(self.remote), str(self.repo))
        self.git(self.repo, "config", "user.name", "Test")
        self.git(self.repo, "config", "user.email", "test@example.invalid")
        (self.repo / "app.txt").write_text("source\n")
        self.git(self.repo, "add", "app.txt")
        self.git(self.repo, "commit", "-m", "Initial")
        self.git(self.repo, "push", "-u", "origin", "HEAD")

    def git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()

    def test_clean_pushed_commit_accepted(self):
        self.assertEqual(installer.pushed_revision(self.repo), self.git(self.repo, "rev-parse", "HEAD"))

    def test_tracked_and_untracked_changes_rejected(self):
        for name in ("app.txt", "new.txt"):
            path = self.repo / name
            original = path.read_text() if path.exists() else None
            path.write_text("local change\n")
            with self.assertRaisesRegex(RuntimeError, "Commit and push"):
                installer.pushed_revision(self.repo)
            if original is None:
                path.unlink()
            else:
                path.write_text(original)

    def test_unpushed_commit_rejected(self):
        self.git(self.repo, "commit", "--allow-empty", "-m", "Not pushed")
        with self.assertRaisesRegex(RuntimeError, "differs from the remote"):
            installer.pushed_revision(self.repo)

    def test_remote_update_is_fetched_and_rejected(self):
        old = self.git(self.repo, "rev-parse", "HEAD")
        self.git(self.repo, "commit", "--allow-empty", "-m", "Remote update")
        self.git(self.repo, "push")
        self.git(self.repo, "reset", "--hard", old)
        # Hide the newer tracking ref to prove that the gate fetches it again.
        upstream = self.git(self.repo, "rev-parse", "--symbolic-full-name", "@{upstream}")
        self.git(self.repo, "update-ref", upstream, old)
        with self.assertRaisesRegex(RuntimeError, "differs from the remote"):
            installer.pushed_revision(self.repo)


if __name__ == "__main__":
    unittest.main()
