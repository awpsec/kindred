import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ios_runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DestinationTests(unittest.TestCase):
    def device(self, name, **extra):
        return dict(name=name, isAvailable=True, **extra)

    def test_newer_duo_does_not_replace_rotation_test_destination(self):
        inventory = {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [self.device('iPhone Duo')], 'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [self.device('iPhone 18 Pro'), self.device('iPhone 17')]}}
        runtime, device = m.select_simulator(inventory)
        self.assertTrue(runtime.endswith('27-0'))
        self.assertEqual(device['name'], 'iPhone 17')

    def test_renamed_duo_is_still_excluded(self):
        with self.assertRaises(AssertionError):
            m.select_simulator({'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [self.device('iPhone QA', deviceTypeIdentifier='com.apple.CoreSimulator.SimDeviceType.iPhone-Duo')]}})

    def test_newest_conventional_runtime_is_used(self):
        inventory = {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [self.device('iPhone 17')], 'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [self.device('iPhone 18 Pro')]}}
        runtime, _ = m.select_simulator(inventory)
        self.assertTrue(runtime.endswith('27-1'))

    def test_missing_iphone_is_a_failure(self):
        with self.assertRaises(AssertionError):
            m.select_simulator({'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [self.device('iPad')]}})
