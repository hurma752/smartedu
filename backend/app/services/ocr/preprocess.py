# app/services/ocr/preprocess.py
"""
Page Preprocessing & Ink Isolation Module for SmartEdu OCR.

Provides:
- Lighting flattening (grayscale division by median-blurred background)
- Deskewing
- Morphological notebook ruled-line removal & stroke inpainting (handwriting branch only)
- Margin & binding-hole blob cleaning
- Date grid header region detection & removal
"""

import cv2
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger("smartedu.ocr.preprocess")


def flatten_lighting_and_deskew(pil_image: Image.Image) -> Image.Image:
    """
    Applies lighting normalization (background division) and deskewing.
    Used by both Print Probe and Handwriting branches.
    """
    gray = np.array(pil_image.convert("L"))

    # 1. Flatten lighting by dividing by median-blurred background
    bg = cv2.medianBlur(gray, 31)
    # Prevent division by zero
    bg = np.maximum(bg, 1)
    normalized = np.clip((gray.astype(np.float32) / bg.astype(np.float32)) * 255.0, 0, 255).astype(np.uint8)

    # 2. Deskewing
    try:
        coords = np.column_stack(np.where(normalized < 220))
        if len(coords) > 50:
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            if 0.5 < abs(angle) < 15:
                (h, w) = normalized.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                normalized = cv2.warpAffine(normalized, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception as exc:
        logger.debug("Deskew warning: %s", exc)

    return Image.fromarray(normalized)


def isolate_handwriting_ink(pil_image: Image.Image) -> tuple[Image.Image, np.ndarray]:
    """
    Handwriting-specific preprocessing pass:
    - Removes horizontal ruled notebook lines via morphological operations.
    - Cleans page margins and binding-hole specks.
    - Crops out top date-grid header region ("Date / M T W T F S S").
    
    Returns (cleaned_pil_image, binary_ink_mask).
    """
    flattened_pil = flatten_lighting_and_deskew(pil_image)
    img_gray = np.array(flattened_pil)
    h, w = img_gray.shape

    # Binarize for ink mask
    _, binary = cv2.threshold(img_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # 1. Crop top header if date grid is detected in the top 15% of the page
    top_region_h = int(h * 0.15)
    header_crop_y = 0
    top_crop = binary[:top_region_h, :]
    # Look for dense horizontal/vertical cluster typical of date boxes
    if top_crop.size > 0 and np.mean(top_crop) > 30:
        header_crop_y = top_region_h

    # 2. Morphological ruled-line removal
    # Detect horizontal lines wider than 35 pixels
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 1))
    detected_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horiz_kernel)

    # Subtract horizontal ruled lines from ink mask
    ink_mask = cv2.subtract(binary, detected_lines)

    # Inpaint small gaps left by removed ruling lines
    ink_mask = cv2.dilate(ink_mask, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 2)), iterations=1)

    # 3. Clean left/right margins and binding-hole blobs
    margin_w = int(w * 0.04)
    ink_mask[:, :margin_w] = 0
    ink_mask[:, w - margin_w:] = 0
    if header_crop_y > 0:
        ink_mask[:header_crop_y, :] = 0

    # Clean isolated small blob noise (binding holes)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(ink_mask)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 12 or area > (w * h * 0.15):  # tiny dots or huge borders
            ink_mask[labels == i] = 0

    # Reconstruct cleaned grayscale image where non-ink is white
    cleaned_gray = np.where(ink_mask > 0, img_gray, 255).astype(np.uint8)

    return Image.fromarray(cleaned_gray), ink_mask
