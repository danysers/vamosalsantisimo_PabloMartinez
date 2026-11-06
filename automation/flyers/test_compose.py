import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops
from compose import TEMPLATES, REGIONS, compose, layout, load_logo


class CompositionTest(unittest.TestCase):
    def test_protected_pixels_and_wrapping(self):
        with tempfile.TemporaryDirectory() as directory:
            # 3 fixed + 12 new: two pages in both formats, including a full two-row page.
            files = compose([TEMPLATES / 'assets/alma.png'] * 12, directory, 3)
            self.assertEqual(len(files), 4)
            for artifact in files:
                kind = artifact['format']
                base = Image.open(TEMPLATES / f'evento-v2-{kind}.png').convert('RGB')
                generated = Image.open(Path(directory) / artifact['name']).convert('RGB')
                diff = ImageChops.difference(base, generated)
                self.assertIsNotNone(diff.getbbox())
                diff.paste((0, 0, 0), REGIONS[kind])
                self.assertIsNone(diff.getbbox(), 'Face, figure, Mila, text, footer and all other pixels must be identical')
                self.assertEqual(artifact['pages'], 2)
                self.assertEqual(generated.size, base.size)

    def test_layout_never_overlaps_or_leaves_permitted_region(self):
        for region in REGIONS.values():
            for count in range(1, 15):
                boxes = layout(count, region)
                self.assertEqual(len(boxes), count)
                for i, (x, y, w, h) in enumerate(boxes):
                    self.assertGreaterEqual(x, 64)
                    self.assertLessEqual(x+w, 1016)
                    self.assertGreaterEqual(y, region[1])
                    self.assertLessEqual(y+h, region[3])
                    for a, b, c, d in boxes[:i]:
                        self.assertFalse(x < a+c and a < x+w and y < b+d and b < y+h)

    def test_rejects_non_raster_and_invalid_versions(self):
        with self.assertRaises(Exception):
            load_logo(TEMPLATES / 'Flyer-final-editable.svg')
        with self.assertRaises(ValueError):
            compose([], '.', 2)


if __name__ == '__main__':
    unittest.main()
