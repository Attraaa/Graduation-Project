import unittest
from unittest.mock import patch
from types import SimpleNamespace
import threading
import time

import cv2
import numpy as np

from keylog.manual_mapping import manual_mapping
from keylog.service import RealtimeAttributionService
from keylog.finger_tracker import MediaPipeFingerTracker

GRID = {'source': 'manual', 'quad': [[.1, .2], [.9, .2], [.9, .8], [.1, .8]], 'turns': 0, 'flipX': False, 'flipY': False}

class ManualMappingTests(unittest.TestCase):
    def test_outer_boundary_and_directions_are_used_by_actual_key_hit_testing(self):
        mapping = manual_mapping(GRID, 1000, 500)
        self.assertEqual(len(mapping.keys), 61)
        center = mapping.keys['Q'].mean(axis=0)
        self.assertEqual(mapping.key_at(*center), 'Q')
        self.assertEqual(mapping.source, 'manual')
        self.assertTrue(mapping.geometry_validated)
        self.assertNotIn('min_confidence', mapping.quality)
        for change in ({'flipX': True}, {'flipY': True}, {'turns': 1}, {'turns': 2}):
            changed = manual_mapping({**GRID, **change}, 1000, 500)
            point = changed.keys['Q'].mean(axis=0)
            self.assertEqual(changed.key_at(*point), 'Q')
            self.assertFalse(np.allclose(point, center))

    def test_invalid_geometry_cannot_become_a_frozen_mapping(self):
        for quad in ([[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [1, 0], [.2, .1], [0, 1]], [[0, 0], [.01, 0], [.01, .01], [0, .01]], [[-1, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [float('nan'), 0], [1, 1], [0, 1]]):
            with self.assertRaises(ValueError): manual_mapping({**GRID, 'quad': quad}, 640, 480)
        with self.assertRaises(ValueError): manual_mapping({**GRID, 'turns': 8}, 640, 480)

    def test_saved_framing_projects_actual_hit_map_even_when_boundary_is_cropped(self):
        width, height = 640, 480
        base = manual_mapping(GRID, width, height)
        frame = {'zoom': 2, 'panX': .1, 'panY': -.15}
        changed = manual_mapping({**GRID, 'framing': frame}, width, height)
        for name, polygon in base.keys.items():
            expected = ((polygon / [width, height] - .5) * 2 + [.6, .35]) * [width, height]
            np.testing.assert_allclose(changed.keys[name], expected, atol=.0002)
        point = changed.keys['Q'].mean(axis=0)
        self.assertEqual(changed.key_at(*point), 'Q')
        self.assertTrue(any((poly < 0).any() for poly in changed.keys.values()))
        small = {**GRID, 'quad': [[.45, .4], [.55, .4], [.55, .5], [.45, .5]]}
        with self.assertRaises(ValueError): manual_mapping(small, width, height)
        enlarged = manual_mapping({**small, 'framing': {'zoom': 3}}, width, height)
        self.assertEqual(enlarged.key_at(*enlarged.keys['Q'].mean(axis=0)), 'Q')

    def test_invalid_saved_framing_is_rejected(self):
        for frame in (None, [], {'zoom': True}, {'zoom': float('nan')}, {'zoom': 6}, {'zoom': .5}, {'zoom': 1, 'panX': .1}, {'zoom': 2, 'panY': -.6}):
            with self.assertRaises(ValueError): manual_mapping({**GRID, 'framing': frame}, 640, 480)

    def test_binary_transport_timestamps_before_inference_and_manual_reset_pauses_input(self):
        class Tracker:
            mirrored = None
            def detect(self, frame, input_is_mirrored=False):
                self.mirrored = input_is_mirrored
                time.sleep(.02)
                return []
            def close(self): pass
        class Analyzer:
            frozen = False
            finger_tracker = Tracker()
            def unfreeze_mapping(self): self.frozen = False
            def freeze_mapping(self, mapping): self.frozen = True; self.mapping = mapping; return True
        with patch('keylog.service.KeyboardPressAnalyzer', lambda **kwargs: Analyzer()):
            service = RealtimeAttributionService(token='camera-test', use_mediapipe=False, expose_test_page=False)
        try:
            client = service.socketio.test_client(service.app, auth={'token': 'camera-test'})
            _, jpeg = cv2.imencode('.jpg', np.zeros((480, 640, 3), dtype=np.uint8))
            at = time.perf_counter_ns()
            response = client.emit('frame', {'token': 'camera-test', 'image': jpeg.tobytes(), 'input_is_mirrored': True}, callback=True)
            self.assertTrue(response['ok'])
            self.assertGreaterEqual(response['timing']['inference_ms'], 15)
            self.assertLess(service.frame_buffer.latest().perf_counter_ns, time.perf_counter_ns() - 15_000_000)
            self.assertGreaterEqual(service.frame_buffer.latest().perf_counter_ns, at)
            self.assertTrue(service.analyzer.finger_tracker.mirrored)
            self.assertFalse(client.emit('manual_keyboard', {'token': 'wrong', 'grid': GRID}, callback=True)['ok'])
            self.assertTrue(client.emit('manual_keyboard', {'token': 'camera-test', 'grid': GRID}, callback=True)['ok'])
            self.assertTrue(service.analyzer.frozen)
            self.assertTrue(service._mapping_ready)
            client.emit('reset_analysis', {'token': 'camera-test'}, callback=True)
            self.assertFalse(service._mapping_ready)
            self.assertFalse(service.analyzer.frozen)
            self.assertEqual(len(service.frame_buffer), 0)
            self.assertFalse(client.emit('browser_key', {'token': 'camera-test', 'code': 'KeyQ'}, callback=True)['ok'])
            client.disconnect()
        finally: service.close()

    def test_reflection_parity_changes_physical_hand_labels_but_grid_direction_does_not(self):
        tracker = MediaPipeFingerTracker.__new__(MediaPipeFingerTracker)
        tracker._input_is_mirrored = False
        tracker._lock = threading.Lock()
        landmarks = SimpleNamespace(landmark=[SimpleNamespace(x=.5, y=.5) for _ in range(21)])
        result = SimpleNamespace(multi_hand_landmarks=[landmarks], multi_handedness=[SimpleNamespace(classification=[SimpleNamespace(label='Left', score=.95)])])
        tracker._hands = SimpleNamespace(process=lambda image: result)
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        self.assertTrue(all(p.hand == 'Right' for p in tracker.detect(frame)))
        self.assertTrue(all(p.hand == 'Left' for p in tracker.detect(frame, input_is_mirrored=True)))
        self.assertTrue(all(p.hand == 'Right' for p in tracker.detect(frame, input_is_mirrored=False)))

if __name__ == '__main__': unittest.main()
