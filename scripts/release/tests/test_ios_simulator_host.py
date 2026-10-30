import importlib.util
import os
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ios_runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SimulatorHostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def app(self, name, display=None):
        app = self.root / 'Applications' / (name + '.app')
        (app / 'Contents').mkdir(parents=True)
        (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleDisplayName': display or name}))
        return app

    def launch(self):
        with patch.dict(os.environ, DEVELOPER_DIR=str(self.root)), patch.object(m, 'OUT', self.root), patch.object(m, 'run') as run:
            m.launch_simulator_host({'udid': 'selected-only'})
            return run.call_args.args[0]

    def test_device_hub_is_preferred_without_obsolete_simulator_argument(self):
        self.app('Simulator')
        hub = self.app('DeviceHub', 'Device Hub')
        self.assertEqual(self.launch(), ['open', '-a', str(hub)])

    def test_space_in_device_hub_app_name(self):
        hub = self.app('Device Hub')
        self.assertEqual(self.launch(), ['open', '-a', str(hub)])

    def test_older_toolchain_uses_exact_simulator_path_and_device(self):
        simulator = self.app('Simulator')
        self.assertEqual(self.launch(), ['open', '-a', str(simulator), '--args', '-CurrentDeviceUDID', 'selected-only'])

    def test_missing_host_is_an_error(self):
        with self.assertRaises(AssertionError):
            self.launch()
