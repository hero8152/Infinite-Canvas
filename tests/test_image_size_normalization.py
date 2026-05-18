import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import main


class ImageSizeNormalizationTest(unittest.TestCase):
    def test_gpt_image_2_preserves_square_4k_ratio(self):
        self.assertEqual(main.normalize_gpt_image_2_size("2880x2880"), "2880x2880")

    def test_gpt_image_2_clamps_oversized_square_without_changing_ratio(self):
        self.assertEqual(main.normalize_gpt_image_2_size("4096x4096"), "2880x2880")

    def test_gpt_image_2_preserves_wide_and_tall_4k_shapes(self):
        self.assertEqual(main.normalize_gpt_image_2_size("3840x2160"), "3840x2160")
        self.assertEqual(main.normalize_gpt_image_2_size("2160x3840"), "2160x3840")


if __name__ == "__main__":
    unittest.main()
