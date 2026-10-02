import os
import tempfile
import unittest
from types import SimpleNamespace

from keylog.raw_input import RawInputObserver, foreground_allowed, physical_code, key_label
from keylog.finger_tracker import _hand_score

class RawInputTests(unittest.TestCase):
    def test_physical_code_is_language_independent(self):
        self.assertEqual(physical_code(0x10, 0), 'KeyQ')
        self.assertEqual(physical_code(0x10, 1), 'KeyQ')
        self.assertEqual(physical_code(0x1d, 2), 'ControlRight')
        self.assertEqual(physical_code(0x2a, 0), 'ShiftLeft')
        self.assertEqual(physical_code(0x36, 0), 'ShiftRight')
        self.assertIsNone(physical_code(0x10, 4))
        self.assertIsNone(physical_code(0xffff, 0))
        self.assertEqual(key_label('KeyQ'), 'q')

    def test_foreground_filter_fails_closed(self):
        approved_path = os.path.realpath(os.path.join(tempfile.gettempdir(), 'normal.exe'))
        approved = {os.path.normcase(approved_path)}
        self.assertTrue(foreground_allowed(approved_path, False, approved))
        for path, elevation in [(None, False), (approved_path, None), (approved_path, True), ('other.exe', False)]:
            self.assertFalse(foreground_allowed(path, elevation, approved))
        game = os.path.join(tempfile.gettempdir(), 'VALORANT.exe')
        self.assertFalse(foreground_allowed(game, False, {os.path.normcase(os.path.realpath(game))}))

    def test_missing_hand_label_score_is_not_a_perfect_fingertip(self):
        self.assertEqual(_hand_score([], 0), 0)
        for score, expected in [(0, 0), (.8, .8), (float('nan'), 0), (2, 0)]:
            hand = SimpleNamespace(classification=[SimpleNamespace(score=score)])
            self.assertEqual(_hand_score([hand], 0), expected)

    @unittest.skipUnless(os.name == 'nt', 'Actual Raw Input window requires Windows')
    def test_native_window_starts_excluded_and_disposes_without_observing_any_input(self):
        statuses, events = [], []
        # A nonexistent path cannot match the foreground. No actual input is read.
        observer = RawInputObserver([os.path.join(tempfile.gettempdir(), 'moti-never-active.exe')],
                                    lambda *event: events.append(event), statuses.append)
        try:
            observer.start()
            self.assertIn('excluded', statuses)
            self.assertFalse(events)
        finally:
            observer.stop()
        self.assertFalse(observer._thread.is_alive())
        self.assertIsNone(observer._hwnd)

if __name__ == '__main__': unittest.main()
