import unittest

from keylog.key_capture import normalize_key_name


class NormalizeBrowserKeyTests(unittest.TestCase):
    def test_uses_physical_letter_code_for_korean_input(self):
        self.assertEqual(normalize_key_name("ㅂ", code="KeyQ"), "Q")
        self.assertEqual(normalize_key_name("ㅁ", code="KeyA"), "A")

    def test_uses_physical_codes_for_letters_digits_and_space(self):
        self.assertEqual(normalize_key_name("q", code="KeyQ"), "Q")
        self.assertEqual(normalize_key_name("!", code="Digit1"), "1")
        self.assertEqual(normalize_key_name(" ", code="Space"), "Spacebar")


if __name__ == "__main__":
    unittest.main()
