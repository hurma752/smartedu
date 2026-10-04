import unittest
from app.services.ocr.scoring import (
    evaluate_handwritten_quality,
    evaluate_print_quality,
    calculate_agreement_score,
    calculate_lexical_validity,
)


class TestOCRScoring(unittest.TestCase):
    def test_agreement_score(self):
        text1 = "The student answered the question correctly."
        text2 = "The student answered question correctly."
        score = calculate_agreement_score(text1, text2)
        self.assertGreater(score, 80.0)

    def test_lexical_validity(self):
        real_text = "Organization structure and management behavior in software engineering"
        gibberish = "asdf qwer zxcv hjkl poiuy trwe"

        self.assertGreater(calculate_lexical_validity(real_text), 70.0)
        self.assertEqual(calculate_lexical_validity(gibberish), 0.0)

    def test_handwritten_quality_gating(self):
        # 1. High quality matching transcript -> ocr_ok
        vlm_high = "This is a clean handwritten answer about software architecture."
        trocr_high = "This is a clean handwritten answer about software architecture."
        res_ok = evaluate_handwritten_quality(vlm_high, trocr_high, trocr_conf=90.0, line_crops_count=1)
        self.assertEqual(res_ok["status_code"], "ocr_ok")
        self.assertGreaterEqual(res_ok["composite_score"], 75.0)

        # 2. Moderate quality -> ocr_needs_review
        vlm_med = "The student wrote about management theory"
        trocr_med = "The stndnt wrte smthing unreadable xyz"
        res_review = evaluate_handwritten_quality(vlm_med, trocr_med, trocr_conf=30.0, line_crops_count=2)
        self.assertIn(res_review["status_code"], ("ocr_needs_review", "ocr_low_confidence"))

        # 3. Poor / Empty transcript -> ocr_low_confidence
        res_low = evaluate_handwritten_quality("", "", trocr_conf=10.0, line_crops_count=5)
        self.assertEqual(res_low["status_code"], "ocr_low_confidence")
        self.assertLess(res_low["composite_score"], 50.0)

    def test_print_quality_gating(self):
        # Print ok (conf >= 80)
        print_ok = evaluate_print_quality("Full printed text sample", confidence=92.0)
        self.assertEqual(print_ok["status_code"], "ocr_ok")

        # Print review (60-80)
        print_review = evaluate_print_quality("Some printed text", confidence=65.0)
        self.assertEqual(print_review["status_code"], "ocr_needs_review")

        # Escalate to handwritten (< 60)
        print_low = evaluate_print_quality("Faint printed text", confidence=40.0)
        self.assertEqual(print_low["status_code"], "ocr_escalate_handwritten")


if __name__ == "__main__":
    unittest.main()
