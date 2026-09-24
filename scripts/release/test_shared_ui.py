import runpy
import subprocess
import tempfile
import unittest
from pathlib import Path

GATE = runpy.run_path(str(Path(__file__).with_name('verify-shared-ui.py')))

class SharedUI(unittest.TestCase):
    def test_exact_commits_and_missing_or_different_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            roots = [Path(temp)/name for name in ('desktop', 'server')]
            sources = []
            for root in roots:
                root.mkdir()
                subprocess.run(['git', 'init', '-q', str(root)], check=True)
                for name in GATE['SHARED']:
                    file = root/name
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_text('matching source\n')
                subprocess.run(['git', '-C', str(root), 'add', '.'], check=True)
                subprocess.run(['git', '-C', str(root), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture'], check=True)
                sources.append(subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip())
            self.assertTrue(GATE['verify'](*roots, *sources)['passed'])
            (roots[1]/'ui/style.css').write_text('uncommitted changes do not alter a release source\n')
            self.assertTrue(GATE['verify'](*roots, *sources)['passed'])
            subprocess.run(['git', '-C', str(roots[1]), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qam', 'Different UI'], check=True)
            changed = subprocess.check_output(['git', '-C', str(roots[1]), 'rev-parse', 'HEAD'], text=True).strip()
            with self.assertRaisesRegex(ValueError, 'ui/style.css'):
                GATE['verify'](*roots, sources[0], changed)
            with self.assertRaisesRegex(ValueError, 'Cannot read'):
                GATE['verify'](*roots, sources[0], '0'*40)
            with self.assertRaisesRegex(ValueError, 'Exact'):
                GATE['verify'](*roots, 'HEAD', changed)

if __name__ == '__main__':
    unittest.main()
