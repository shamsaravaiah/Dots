import os
import csv
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# -------------------------------------------------------
# CONFIG
# -------------------------------------------------------
WIDTH, HEIGHT = 800, 1200
MARGIN = 40

LOGO_BOX = (MARGIN, MARGIN, MARGIN + 160, MARGIN + 60)
HEADLINE_Y = LOGO_BOX[3] + 30
BODY_Y = HEADLINE_Y + 120

N_SAMPLES = 120
VALID_RATIO = 0.5

# >>> Adjust this base directory to wherever you want the data
BASE_DIR = Path("/Users/sham_sara/Desktop/ikea e2e")

IMAGE_DIR = BASE_DIR / "synthetic_dataset"
LABELS_PATH = BASE_DIR / "synthetic_labels.csv"

IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------
# FONT HELPERS
# -------------------------------------------------------
def load_font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except:
        return ImageFont.load_default()

FONT_LOGO = load_font(26)
FONT_BODY = load_font(26)


def get_text_size(draw, text, font):
    """
    Pillow 10+ removed draw.textsize, so we use textbbox.
    This helper works across versions.
    """
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        return w, h
    except AttributeError:
        # Fallback for very old Pillow versions
        return draw.textsize(text, font=font)

# -------------------------------------------------------
# CONTENT
# -------------------------------------------------------
ENGLISH_HEADLINES = [
    "Smart Storage Solutions",
    "New Collection Arrived",
    "Create Your Space",
    "Simple Home Ideas",
]

ENGLISH_BODY = [
    "Discover furniture that adapts to your life.",
    "Find flexible designs for any room.",
    "Style and quality for everyday living.",
    "Make your home work for you.",
]

FOREIGN_TEXT = [
    "Soluciones para cada hogar y espacio.",
    "Découvrez des idées pour votre maison.",
    "Soluzioni per ogni stanza della casa.",
    "Descubra diseños flexibles para su espacio.",
]

# -------------------------------------------------------
# HELPERS
# -------------------------------------------------------
def draw_base():
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img)

    # header bar for better aesthetics
    draw.rectangle((0, 0, WIDTH, 200), fill=(220, 230, 255))

    return img, draw


def draw_logo(draw, remove=False, randomize=False):
    if remove:
        return None, 0, 0

    x1, y1, x2, y2 = LOGO_BOX

    if randomize:
        w = x2 - x1
        h = y2 - y1
        x1 = random.randint(0, WIDTH - w)
        y1 = random.randint(0, 200 - h)
        x2, y2 = x1 + w, y1 + h

    draw.rectangle((x1, y1, x2, y2), outline="black", fill=(245, 245, 245))
    # Center "LOGO" text roughly in the box
    text = "LOGO"
    tw, th = get_text_size(draw, text, FONT_LOGO)
    tx = x1 + (x2 - x1 - tw) / 2
    ty = y1 + (y2 - y1 - th) / 2
    draw.text((tx, ty), text, font=FONT_LOGO, fill="black")

    # Check position
    bx1, by1, bx2, by2 = LOGO_BOX
    logo_pos_ok = int(x1 >= bx1 and y1 >= by1 and x2 <= bx2 and y2 <= by2)

    return (x1, y1, x2, y2), 1, logo_pos_ok


def draw_headline(draw, text, font_size):
    font = load_font(font_size)
    tw, th = get_text_size(draw, text, font)
    x = WIDTH // 2 - tw // 2
    y = HEADLINE_Y
    draw.text((x, y), text, font=font, fill="black")
    return (x, y, x + tw, y + th), font_size


def draw_body(draw, text, outside_margins=False):
    words = text.split()
    font = FONT_BODY

    x = MARGIN if not outside_margins else 5
    y = BODY_Y

    boxes = []
    line = ""

    for w in words:
        test = f"{line} {w}".strip()
        tw, _ = get_text_size(draw, test, font)
        if tw < WIDTH - 2 * MARGIN:
            line = test
        else:
            # draw current line
            line_tw, line_th = get_text_size(draw, line, font)
            draw.text((x, y), line, font=font, fill="black")
            boxes.append((x, y, x + line_tw, y + line_th))
            y += line_th + 4
            line = w

    # draw last line
    if line:
        line_tw, line_th = get_text_size(draw, line, font)
        draw.text((x, y), line, font=font, fill="black")
        boxes.append((x, y, x + line_tw, y + line_th))

    return boxes


def within_margins(boxes):
    for (x1, y1, x2, y2) in boxes:
        if x1 < MARGIN or y1 < MARGIN or x2 > WIDTH - MARGIN or y2 > HEIGHT - MARGIN:
            return 0
    return 1

# -------------------------------------------------------
# MAIN SAMPLE GENERATOR
# -------------------------------------------------------
def generate(idx, valid=True):
    img, draw = draw_base()

    # Defaults
    remove_logo = False
    randomize_logo = False
    headline_size = 60
    english = True
    body_outside = False

    if not valid:
        violations = random.sample(
            ["logo_present", "logo_position", "font", "language", "margins"],
            k=random.randint(1, 3)
        )

        if "logo_present" in violations:
            remove_logo = True
        if "logo_position" in violations and not remove_logo:
            randomize_logo = True
        if "font" in violations:
            headline_size = random.randint(20, 40)
        if "language" in violations:
            english = False
        if "margins" in violations:
            body_outside = True

    # Content
    headline = random.choice(ENGLISH_HEADLINES)
    body = random.choice(ENGLISH_BODY if english else FOREIGN_TEXT)

    # Draw elements
    logo_box, logo_present, logo_pos_ok = draw_logo(draw, remove_logo, randomize_logo)
    headline_box, used_size = draw_headline(draw, headline, headline_size)
    body_boxes = draw_body(draw, body, body_outside)

    headline_ok = int(used_size >= 48)
    lang_ok = int(english)
    margins_ok = within_margins([headline_box] + body_boxes)

    is_valid = int(all([
        logo_present,
        logo_pos_ok,
        headline_ok,
        lang_ok,
        margins_ok
    ]))

    # If we requested a valid sample but random violations made it invalid, regenerate
    if valid and is_valid == 0:
        return generate(idx, valid=True)

    filename = f"img_{idx:04d}.png"
    img.save(IMAGE_DIR / filename)

    return {
        "filename": filename,
        "is_valid": is_valid,
        "logo_present": logo_present,
        "logo_position_ok": logo_pos_ok,
        "headline_size_ok": headline_ok,
        "language_ok": lang_ok,
        "margins_ok": margins_ok,
    }

# -------------------------------------------------------
# RUN GENERATION
# -------------------------------------------------------
def main():
    labels = []
    n_valid = int(N_SAMPLES * VALID_RATIO)
    n_invalid = N_SAMPLES - n_valid

    idx = 1
    for _ in range(n_valid):
        labels.append(generate(idx, True))
        idx += 1
    for _ in range(n_invalid):
        labels.append(generate(idx, False))
        idx += 1

    with open(LABELS_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(labels[0].keys()))
        writer.writeheader()
        writer.writerows(labels)

    print(f"Dataset created: {len(labels)} images")
    print(f"Images dir: {IMAGE_DIR}")
    print(f"Labels CSV: {LABELS_PATH}")


if __name__ == "__main__":
    main()
