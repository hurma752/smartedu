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


def _clean_ink(ink: np.ndarray) -> np.ndarray:
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    out = ink.copy()
    for k in range(1, n):
        x, y, w, h, a = st[k]
        if a < 15 or (h <= 7 and w / max(h, 1) >= 3):   # specks + ruling dashes
            out[lab == k] = 0
    return out


def _trim_edge_islands(cols: np.ndarray, W: int, gap: int = 40, edge: float = 0.04) -> np.ndarray:
    """Drop ring blobs / stray marks in the outer 4% separated from text by a wide gap."""
    if len(cols) < 2:
        return cols
    groups = np.split(cols, np.where(np.diff(cols) > gap)[0] + 1)
    while len(groups) > 1 and groups[0][-1] < W * edge:
        groups = groups[1:]
    while len(groups) > 1 and groups[-1][0] > W * (1 - edge):
        groups = groups[:-1]
    return np.concatenate(groups)


def _split_multiline_band(ink_band: np.ndarray, y1: int, y2: int, med_height: float) -> list[tuple[int, int]]:
    """
    Splits tall multiline bands (>1.5x median height) at horizontal projection valleys
    so multi-line blocks are properly segmented into individual lines for OCR.
    """
    lh = y2 - y1
    if lh < 1.5 * med_height:
        return [(y1, y2)]

    prof = ink_band.sum(axis=1).astype(np.float32)
    prof_smooth = cv2.GaussianBlur(prof.reshape(-1, 1), (15, 1), 0).ravel()
    min_dist = max(35, int(med_height * 0.55))

    try:
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(prof_smooth, distance=min_dist, prominence=max(15.0, float(np.percentile(prof_smooth, 30)) * 0.1))
    except Exception:
        peaks = []

    if len(peaks) <= 1:
        return [(y1, y2)]

    sub_bands = []
    prev_y = y1
    for i in range(len(peaks) - 1):
        p1 = peaks[i]
        p2 = peaks[i + 1]
        valley_rel = p1 + int(np.argmin(prof_smooth[p1:p2]))
        cut_y = y1 + valley_rel
        if cut_y - prev_y >= 30:
            sub_bands.append((prev_y, cut_y))
            prev_y = cut_y
    if y2 - prev_y >= 30:
        sub_bands.append((prev_y, y2))
    elif sub_bands:
        sub_bands[-1] = (sub_bands[-1][0], y2)

    return sub_bands if sub_bands else [(y1, y2)]


def _word_gaps(col_ink: np.ndarray, min_gap: int) -> list[tuple[int, int]]:
    gaps, s = [], None
    for x, v in enumerate(col_ink):
        if v == 0 and s is None:
            s = x
        if v != 0 and s is not None:
            if x - s >= min_gap:
                gaps.append((s, x))
            s = None
    return gaps


def segment_page_lines(
    page_image: Image.Image,
    ink_mask: np.ndarray,
    max_aspect: float = 12.0,
    min_ink_frac: float = 0.05,
) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    """
    Segments handwritten page into line crops strictly between word gaps,
    splitting merged multiline bands, and filtering ruled-line remnants and edge noise.
    """
    if ink_mask is None or ink_mask.size == 0:
        return []

    W, H = page_image.size
    ink = _clean_ink(ink_mask)
    rows = cv2.GaussianBlur(ink.sum(1).astype(np.float32).reshape(-1, 1), (9, 1), 0).ravel()
    thr = max(2.0, np.percentile(rows[rows > 0], 60) * 0.12) if (rows > 0).any() else 2.0
    bands, s = [], None
    for y, d in enumerate(rows):
        if d > thr and s is None:
            s = y
        elif d <= thr and s is not None:
            if y - s >= 14:
                bands.append((s, y))
            s = None
    if s is not None and H - s >= 14:
        bands.append((s, H))
    if not bands:
        return []

    # Estimate expected single line height from normal bands
    reasonable_heights = [y2 - y1 for y1, y2 in bands if 40 <= y2 - y1 <= 150]
    med_height = float(np.median(reasonable_heights)) if reasonable_heights else 80.0

    # Split multiline merged bands via peak/valley detection
    split_bands = []
    for y1, y2 in bands:
        split_bands.extend(_split_multiline_band(ink[y1:y2], y1, y2, med_height))
    bands = split_bands

    band_ink = [int(ink[a:b].sum() / 255) for a, b in bands]
    med_ink = float(np.median(band_ink)) if band_ink else 1.0
    out = []
    for (y1, y2), bi in zip(bands, band_ink):
        # Only drop virtually blank bands (e.g. less than 5% of median)
        if bi < med_ink * min_ink_frac and bi < 100:
            continue
        band = ink[y1:y2]
        cols = _trim_edge_islands(np.where(band.sum(0) > 0)[0], W)
        if len(cols) == 0:
            continue
        x1, x2 = cols[0], cols[-1] + 1
        lh = y2 - y1
        pv = max(6, int(lh * 0.25))
        cy1, cy2 = max(0, y1 - pv), min(H, y2 + pv)
        parts = int(np.ceil(((x2 - x1) / float(cy2 - cy1)) / max_aspect))
        cuts = [x1]
        if parts > 1:                                       # split ONLY inside real word gaps
            gaps = _word_gaps(band[:, x1:x2].sum(0), max(14, int(lh * 0.30)))
            for i in range(1, parts):
                tgt = x1 + (x2 - x1) * i / parts
                if gaps:
                    g = min(gaps, key=lambda g: abs((g[0] + g[1]) / 2 + x1 - tgt))
                    cuts.append(x1 + (g[0] + g[1]) // 2)
        cuts.append(x2)
        cuts = sorted(set(cuts))
        for a, b in zip(cuts[:-1], cuts[1:]):               # no overlap between chunks
            box = (max(0, a - 8), cy1, min(W, b + 8), cy2)
            out.append((page_image.crop(box), box))
    return out
