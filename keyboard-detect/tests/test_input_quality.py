import unittest
from unittest.mock import patch

from keylog.service import RealtimeAttributionService


class InputQualityTest(unittest.TestCase):
    def test_full_queue_is_reported_without_adding_a_judged_input(self):
        with patch.object(RealtimeAttributionService, "_process_events", return_value=None):
            service = RealtimeAttributionService(use_mediapipe=False)
        self.addCleanup(service.close)
        service._client = "test-peer"
        with patch.object(service.socketio, "emit") as notify:
            for _ in range(65):
                service.enqueue_key_event(object())
        self.assertEqual(service.event_queue.qsize(), 64)
        notify.assert_called_once_with(
            "input_quality", {"observed": 65, "processed": 0, "dropped": 1, "maxQueueWaitMs": 0}, to="test-peer"
        )


if __name__ == "__main__":
    unittest.main()
