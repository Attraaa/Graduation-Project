import hashlib
import subprocess
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from auto_map import CORNER_ALIASES, detect_corners_raw, normalize_class_name  # noqa: E402
from corner_detector import OnnxCornerDetector, letterbox, scale_boxes, top_box_per_class  # noqa: E402


class PreprocessingTests(unittest.TestCase):
    def test_letterbox_pads_only_up_to_the_stride(self):
        image = letterbox(np.zeros((480, 640, 3), np.uint8), 800, 32)
        # 640x480 scales to 800x600; 8 rows of padding make 608, split evenly.
        self.assertEqual(image.shape, (608, 800, 3))
        self.assertTrue((image[:4] == 114).all() and (image[-4:] == 114).all() and (image[4:-4] == 0).all())
        self.assertEqual(letterbox(np.zeros((540, 960, 3), np.uint8), 800, 32).shape, (480, 800, 3))
        self.assertEqual(letterbox(np.zeros((640, 640, 3), np.uint8), 800, 32).shape, (800, 800, 3))

    def test_scale_boxes_undoes_the_padding_and_clips_to_the_frame(self):
        boxes = np.array([[100, 104, 200, 204], [700, 0, 900, 50]], np.float32)
        np.testing.assert_allclose(scale_boxes(boxes, (608, 800), (480, 640)),
                                   [[80, 80, 160, 160], [560, 0, 640, 36.8]], atol=1e-4)


class TopBoxTests(unittest.TestCase):
    def test_each_class_keeps_its_best_anchor_above_the_threshold(self):
        anchors = [  # cx, cy, w, h, then the four class scores
            [10, 10, 4, 4, .30, 0, 0, 0],
            [20, 20, 4, 4, .60, 0, 0, 0],
            [30, 30, 4, 4, 0, .10, 0, 0],    # not above the threshold
            [40, 40, 4, 4, 0, 0, .50, .45],  # counts only for its best class, 2
            [50, 50, 4, 4, 0, 0, 0, .40],
        ]
        output = np.array(anchors, np.float32).T[None]
        top = top_box_per_class(output, conf=.1)
        self.assertEqual(sorted(top), [0, 2, 3])
        np.testing.assert_allclose(top[0][0], [18, 18, 22, 22])
        self.assertAlmostEqual(top[0][1], .6, places=6)
        self.assertAlmostEqual(top[3][1], .4, places=6)
        self.assertEqual(top_box_per_class(output, conf=.7), {})


class ExportedModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detector = OnnxCornerDetector(str(ROOT / "models" / "best.onnx"))

    def test_classes_are_the_four_corner_keys(self):
        self.assertEqual({normalize_class_name(name) for name in self.detector.names.values()}, set(CORNER_ALIASES))

    def test_onnx_was_exported_from_the_checked_in_checkpoint(self):
        digest = hashlib.sha256((ROOT / "models" / "best.pt").read_bytes()).hexdigest()
        self.assertEqual(self.detector.metadata.get("source_sha256"), digest,
                         "models/best.pt changed: run scripts/export_onnx.py, then scripts/check_onnx_parity.py")

    def test_blank_frame_runs_and_finds_no_corners(self):
        self.assertEqual(detect_corners_raw(self.detector, np.zeros((480, 640, 3), np.uint8), conf=.1, imgsz=800), {})


class RuntimeDependencyTests(unittest.TestCase):
    def test_analyzer_starts_without_pytorch(self):
        code = ("import sys; from keylog.analyzer import KeyboardPressAnalyzer; KeyboardPressAnalyzer(); "
                "print([m for m in ('torch', 'torchvision', 'ultralytics') if m in sys.modules])")
        result = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "[]")


if __name__ == "__main__":
    unittest.main()
