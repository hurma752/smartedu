# app/services/ocr/lines.py
"""
Projection-Based Line Segmentation Module for SmartEdu OCR.

Performs robust handwritten line extraction independent of Tesseract layout analysis:
- Horizontal ink density projection profile
- Valley detection & peak splitting for merged multiline bands (>2.2x median height)
- 20% vertical padding (protects cursive descenders/ascenders)
- Inter-word splitting for wide aspect ratio lines (>14:1)
- Filtering of blank slivers & sparse component noise to eliminate hallucinations
"""

import cv2
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger("smartedu.ocr.lines")


def segment_page_lines(
    page_image: Image.Image,
    ink_mask: np.ndarray,
    max_lines: int = 40
) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    """
    Segments a handwritten page image into line crops in top-to-bottom reading order.

    Returns list of (crop_pil_image, (x1, y1, x2, y2)).
    """
    W, H = page_image.size
    if ink_mask is None or ink_mask.size == 0:
        return []

    # Horizontal density projection profile (sum of ink pixels across each row)
    row_density = ink_mask.sum(axis=1).astype(np.float32)

    # Smooth profile with Gaussian 1D kernel
    smoothed = cv2.GaussianBlur(row_density.reshape(-1, 1), (15, 1), 0).ravel()
    threshold = max(2.0, smoothed.max() * 0.03)

    # Detect line bands
    raw_bands = []
    in_line = False
    start_y = 0

    for y, d in enumerate(smoothed):
        if d > threshold and not in_line:
            in_line = True
            start_y = y
        elif d <= threshold and in_line:
            in_line = False
            band_h = y - start_y
            if band_h >= 8:  # Ignore slivers under 8px
                raw_bands.append((start_y, y))
    if in_line and (H - start_y) >= 8:
        raw_bands.append((start_y, H))

    if not raw_bands:
        return []

    # Calculate median line height
    heights = [y2 - y1 for y1, y2 in raw_bands]
    median_h = max(12, int(np.median(heights)))

    # Split oversized bands taller than 2.2x median height at their deepest valley
    split_bands = []
    for y1, y2 in raw_bands:
        band_h = y2 - y1
        if band_h > int(median_h * 2.2):
            # Find deepest valley in the middle 60% of the band
            mid_start = y1 + int(band_h * 0.2)
            mid_end = y1 + int(band_h * 0.8)
            if mid_end > mid_start:
                split_point = mid_start + int(np.argmin(smoothed[mid_start:mid_end]))
                split_bands.append((y1, split_point))
                split_bands.append((split_point, y2))
            else:
                split_bands.append((y1, y2))
        else:
            split_bands.append((y1, y2))

    line_results = []
    for y1, y2 in split_bands[:max_lines]:
        band_h = y2 - y1

        # Check connected components in the band to filter noise
        band_mask = ink_mask[y1:y2, :]
        num_cc, _, stats, _ = cv2.connectedComponentsWithStats(band_mask)
        if num_cc <= 2 or np.sum(band_mask) < (W * 0.005):
            continue  # Sparse noise / blank band

        # Find tight horizontal ink bounds
        col_density = band_mask.sum(axis=0)
        cols_with_ink = np.where(col_density > 0)[0]
        if len(cols_with_ink) == 0:
            continue

        x1 = cols_with_ink[0]
        x2 = cols_with_ink[-1]
        band_w = x2 - x1

        if band_w < 15:
            continue

        # Add ~20% vertical padding to protect descenders and ascenders
        pad_v = max(4, int(band_h * 0.20))
        pad_h = 6

        crop_y1 = max(0, y1 - pad_v)
        crop_y2 = min(H, y2 + pad_v)
        crop_x1 = max(0, x1 - pad_h)
        crop_x2 = min(W, x2 + pad_h)

        crop_bbox = (crop_x1, crop_y1, crop_x2, crop_y2)
        crop_img = page_image.crop(crop_bbox)

        # Inter-word splitting for very wide aspect ratio bands (> 14:1)
        aspect_ratio = (crop_x2 - crop_x1) / float(max(1, crop_y2 - crop_y1))
        if aspect_ratio > 14.0 and band_w > 400:
            # Split line at widest inter-word gap in col_density
            gap_threshold = np.max(col_density) * 0.05
            is_gap = col_density < gap_threshold
            gap_indices = np.where(is_gap)[0]

            if len(gap_indices) > 5:
                # Find widest gap near the center 40%-60%
                mid_x1 = int(band_w * 0.35)
                mid_x2 = int(band_w * 0.65)
                mid_gaps = [g for g in gap_indices if mid_x1 <= g <= mid_x2]
                if mid_gaps:
                    split_x = x1 + mid_gaps[len(mid_gaps) // 2]
                    # Part 1
                    b1 = (max(0, x1 - pad_h), crop_y1, min(W, split_x + pad_h), crop_y2)
                    line_results.append((page_image.crop(b1), b1))
                    # Part 2
                    b2 = (max(0, split_x - pad_h), crop_y1, min(W, x2 + pad_h), crop_y2)
                    line_results.append((page_image.crop(b2), b2))
                    continue

        line_results.append((crop_img, crop_bbox))

    return line_results
