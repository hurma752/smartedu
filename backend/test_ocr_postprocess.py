import unittest
from app.services.ocr.postprocess import clean_line_text, clean_academic_text


class TestOCRPostprocess(unittest.TestCase):
    def test_hallucination_blacklist(self):
        sample_hallucinations = [
            "What links here to this page",
            "Special pages in Wikipedia",
            "Related changes from external source",
            "See also: American politician biography",
            "Equation given by \\displaystyle \\frac{a}{b}",
            "Permanent link to this article",
            "Cite this page in APA format",
            "Wikidata item Q12345",
        ]

        for sample in sample_hallucinations:
            cleaned = clean_line_text(sample)
            self.assertEqual(cleaned, "", f"Expected hallucination line to be filtered out, got: {cleaned!r}")

    def test_watermark_removal(self):
        sample_watermarks = [
            "Scanned by CamScanner",
            "Scanned with Adobe Scan",
            "Date / M T W T F S S",
            "Page 1 of 5",
        ]

        for sample in sample_watermarks:
            cleaned = clean_line_text(sample)
            self.assertEqual(cleaned, "", f"Expected watermark line to be filtered out, got: {cleaned!r}")

    def test_noise_and_zero_runs(self):
        noise_lines = [
            "000000000000",
            ".000 # 1.000",
            "--- === +++",
        ]

        for line in noise_lines:
            cleaned = clean_line_text(line)
            self.assertEqual(cleaned, "", f"Expected noise line to be filtered out, got: {cleaned!r}")

    def test_valid_student_text_preserved(self):
        student_lines = [
            "The quick brown fox jumps over the lazy dog.",
            "Section 1: Organizational Behavior Theory",
            "Answer: The derivative of f(x) = x^2 is 2x.",
        ]

        for line in student_lines:
            cleaned = clean_line_text(line)
            self.assertTrue(len(cleaned) > 0)
            self.assertEqual(cleaned, line.strip())

    def test_academic_text_full_cleaning(self):
        raw_document = """
Date / M T W T F S S
Organizational Behavior Analysis

Scanned by CamScanner
In this paper, we study the structu-
ral properties of team leadership.

What links here
What links here
In this paper, we study the structu-
ral properties of team leadership.

00000000
Conclusion: Team cohesion improves performance.
"""

        cleaned = clean_academic_text(raw_document)
        self.assertNotIn("CamScanner", cleaned)
        self.assertNotIn("What links here", cleaned)
        self.assertNotIn("00000000", cleaned)
        self.assertIn("structural properties", cleaned)
        self.assertIn("Conclusion: Team cohesion improves performance.", cleaned)


if __name__ == "__main__":
    unittest.main()
