"""Packaging orchestration tests; actual DMG acceptance still requires a Mac."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('package-macos-dmg.sh')
TARGET = 'x86_64-apple-darwin'
FAKE_TOOL = '''#!/usr/bin/env python3
import json,os,shutil,sys
from pathlib import Path
name=Path(sys.argv[0]).name;args=sys.argv[1:]
with open(os.environ['COMMAND_LOG'],'a') as f:f.write(json.dumps([name,*args])+'\\n')
if name=='uname':print('Darwin' if args==['-s'] else os.environ.get('TEST_ARCH','x86_64'))
elif name=='codesign':
 assert args[:4]==['--verify','--deep','--strict','--verbose=2']
 if os.environ.get('FAIL_STAGE')=='signature':sys.exit(3)
elif name=='ditto':shutil.copytree(*args,symlinks=True)
elif name=='hdiutil':
 if args[0]=='create':
  stage=Path(args[args.index('-srcfolder')+1])
  assert os.readlink(stage/'Applications')=='/Applications'
  assert (stage/'Kindred.app/Contents/MacOS/kindred-desktop').read_bytes()==b'app-fixture'
  if os.environ.get('FAIL_STAGE')=='image':sys.exit(4)
  Path(args[-1]).write_bytes(b'dmg-fixture')
 else:assert args[0]=='verify' and Path(args[1]).read_bytes()==b'dmg-fixture'
'''


@unittest.skipUnless(shutil.which('bash'), 'Requires bash for orchestration tests')
class MacPackaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='kindred-mac-packaging-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / 'desktop/target' / TARGET / 'release/bundle'
        self.executable = self.bundle / 'macos/Kindred.app/Contents/MacOS/kindred-desktop'
        self.executable.parent.mkdir(parents=True)
        self.executable.write_bytes(b'app-fixture')
        self.image = self.bundle / 'dmg' / f'Kindred-0.52.0-{TARGET}.dmg'
        self.log = self.root / 'commands.jsonl'
        tools = self.root / 'tools'; tools.mkdir()
        for name in ['uname', 'codesign', 'ditto', 'hdiutil']:
            p = tools / name; p.write_text(FAKE_TOOL); p.chmod(0o755)
        self.work = self.root / 'temp'; self.work.mkdir()
        self.env = dict(os.environ, PATH=str(tools)+os.pathsep+os.environ['PATH'],
                        TMPDIR=str(self.work), KINDRED_PACKAGE_SOURCE_ROOT=str(self.root),
                        COMMAND_LOG=str(self.log))

    def run_script(self, **env):
        result = subprocess.run(['bash', str(SCRIPT), TARGET, '0.52.0'],
                                env=dict(self.env, **env), capture_output=True, text=True)
        self.assertEqual(self.executable.read_bytes(), b'app-fixture')
        self.assertEqual(list(self.work.iterdir()), [])
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_create_image_preserves_app_and_verifies_before_accepting(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.image.read_bytes(), b'dmg-fixture')
        self.assertEqual([c[:2] for c in self.calls() if c[0]=='hdiutil'],
                         [['hdiutil', 'create'], ['hdiutil', 'verify']])

    def test_packaging_failure_preserves_app_and_is_not_retried(self):
        self.assertNotEqual(self.run_script(FAIL_STAGE='image').returncode, 0)
        self.assertFalse(self.image.exists())
        self.assertEqual([c[:2] for c in self.calls() if c[0]=='hdiutil'], [['hdiutil', 'create']])

    def test_invalid_signature_stops_before_creating_image(self):
        self.assertNotEqual(self.run_script(FAIL_STAGE='signature').returncode, 0)
        self.assertFalse(self.image.exists())
        self.assertFalse(any(c[0] in ['ditto', 'hdiutil'] for c in self.calls()))

    def test_existing_package_is_never_overwritten(self):
        self.image.parent.mkdir(); self.image.write_bytes(b'existing')
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertEqual(self.image.read_bytes(), b'existing')

    def test_wrong_native_architecture_is_rejected(self):
        self.assertNotEqual(self.run_script(TEST_ARCH='arm64').returncode, 0)
        self.assertFalse(self.image.exists())


if __name__ == '__main__':
    unittest.main()
