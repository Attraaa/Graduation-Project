import unittest
from unittest.mock import patch
import time
import base64
import cv2
import numpy as np

from keylog.service import RealtimeAttributionService, decode_data_url

class DummyAnalyzer:
    def __init__(self, **_kwargs): self.frozen = False; self.finger_tracker = None
    def unfreeze_mapping(self): self.frozen = False

class ServicePrivacyTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch('keylog.service.KeyboardPressAnalyzer', DummyAnalyzer)
        self.patch.start()
        self.service = RealtimeAttributionService(token='test-token-only', expose_test_page=False, use_mediapipe=False)
    def tearDown(self):
        self.service.close(); self.patch.stop()
    def connect(self): return self.service.socketio.test_client(self.service.app, auth={'token': 'test-token-only'})

    def test_token_required_and_legacy_global_hook_disabled(self):
        unauthorized = self.service.socketio.test_client(self.service.app, auth={'token': 'wrong'})
        self.assertFalse(unauthorized.is_connected())
        client = self.connect(); self.assertTrue(client.is_connected())
        second = self.connect(); self.assertFalse(second.is_connected())
        self.assertFalse(client.emit('browser_key', {'token': 'wrong', 'code': 'KeyQ'}, callback=True)['ok'])
        self.assertEqual(self.service.app.test_client().post('/api/keylogger/start', json={'token': 'test-token-only'}).status_code, 403)
        client.disconnect()

    def test_aggregate_source_never_accepts_text_and_clears_pending_input_on_pause(self):
        client = self.connect(); self.service.analyzer.frozen = True
        captured = []
        self.service.enqueue_key_event = captured.append
        response = client.emit('browser_key', {'token': 'test-token-only', 'key': 'private text', 'code': 'KeyQ', 'context': 'shift-right'}, callback=True)
        self.assertTrue(response['ok']); self.assertEqual(captured[0].key, 'q'); self.assertEqual(captured[0].context, 'shift-right')
        self.assertFalse(client.emit('browser_key', {'token': 'test-token-only', 'code': 'private text'}, callback=True)['ok'])
        self.assertFalse(client.emit('browser_key', {'token': 'test-token-only', 'code': 'KeyQ', 'context': 'private text'}, callback=True)['ok'])
        self.service.event_queue.put((self.service._privacy_generation, captured[0]))
        self.service._observation_status('excluded')
        self.assertTrue(self.service.event_queue.empty()); self.assertEqual(len(self.service.frame_buffer), 0)
        client.disconnect()

    def test_frame_buffer_is_bounded_and_disconnect_clears_images(self):
        client = self.connect()
        _, data = cv2.imencode('.jpg', np.zeros((16, 32, 3), dtype=np.uint8))
        image = 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')
        for _ in range(20):
            self.assertTrue(client.emit('frame', {'token': 'test-token-only', 'image': image, 'browser_perf_ms': time.perf_counter() * 1000}, callback=True)['ok'])
        self.assertEqual(len(self.service.frame_buffer), 12)
        self.assertFalse(client.emit('frame', {'token': 'test-token-only', 'image': 'invalid'}, callback=True)['ok'])
        client.disconnect(); self.assertEqual(len(self.service.frame_buffer), 0)
        self.assertIsNone(decode_data_url('not a jpeg'))

    def test_pause_requires_owner_token_and_stops_approved_app_observer(self):
        from unittest.mock import Mock
        client = self.connect()
        observer = Mock()
        self.service.observer = observer
        generation = self.service._privacy_generation
        self.service._mapping_ready = True
        self.assertFalse(client.emit('stop_observation', {'token': 'wrong'}, callback=True)['ok'])
        observer.stop.assert_not_called()
        self.assertTrue(client.emit('stop_observation', {'token': 'test-token-only'}, callback=True)['ok'])
        observer.stop.assert_called_once()
        self.assertFalse(self.service._mapping_ready)
        self.assertGreater(self.service._privacy_generation, generation)
        self.assertTrue(self.service.event_queue.empty())
        client.disconnect()

if __name__ == '__main__': unittest.main()
