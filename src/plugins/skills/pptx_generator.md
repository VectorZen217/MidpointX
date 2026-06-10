---
name: PPTX_GENERATOR
description: Create, edit, and visually QA PowerPoint presentations (.pptx) — covers reading content, editing templates, creating from scratch with pptxgenjs, design guidance, and required visual verification.
---

# PPTX Creation, Editing, and QA

## Quick Reference

| Task | Approach |
|---|---|
| Read / analyze content | `python -m markitdown presentation.pptx` |
| Edit or create from template | Unpack → edit XML → pack |
| Create from scratch | Use `pptxgenjs` (`npm install -g pptxgenjs`) |
| Visual overview | `python scripts/thumbnail.py presentation.pptx` |
| Convert to images for QA | `soffice → pdftoppm` |

## Reading Content

```bash
python -m markitdown presentation.pptx
python scripts/office/unpack.py presentation.pptx unpacked/
```

---

## Design Principles

**Don't create boring slides.** Plain bullets on a white background won't impress anyone.

### Before Starting

- **Pick a bold, content-informed color palette** — if swapping your colors into a different presentation would still "work," you haven't made specific enough choices
- **Dominance over equality** — one color dominates (60–70% visual weight), 1–2 supporting tones, one sharp accent
- **Dark/light contrast** — dark backgrounds for title + conclusion, light for content ("sandwich"). Or commit to dark throughout
- **Commit to a visual motif** — one distinctive element repeated across every slide (rounded image frames, icons in colored circles, thick single-side borders)

### Color Palettes

| Theme | Primary | Secondary | Accent |
|---|---|---|---|
| Midnight Executive | `1E2761` navy | `CADCFC` ice blue | `FFFFFF` white |
| Forest & Moss | `2C5F2D` forest | `97BC62` moss | `F5F5F5` cream |
| Coral Energy | `F96167` coral | `F9E795` gold | `2F3C7E` navy |
| Ocean Gradient | `065A82` deep blue | `1C7293` teal | `21295C` midnight |
| Charcoal Minimal | `36454F` charcoal | `F2F2F2` off-white | `212121` black |
| Cherry Bold | `990011` cherry | `FCF6F5` off-white | `2F3C7E` navy |

### Layout Options (vary across slides)

- Two-column: text left, illustration right
- Icon + text rows: icon in colored circle, bold header, description below
- 2×2 or 2×3 grid
- Half-bleed image with content overlay
- Large stat callouts (60–72pt numbers with small labels)

### Typography

| Element | Size |
|---|---|
| Slide title | 36–44pt bold |
| Section header | 20–24pt bold |
| Body text | 14–16pt |
| Captions | 10–12pt muted |

Avoid defaulting to Arial — choose a header font with personality paired with a clean body font.

### Avoid (Common Mistakes)

- Don't repeat the same layout across all slides
- Don't center body text — left-align paragraphs and lists
- Don't default to blue — pick colors that reflect the specific topic
- Don't create text-only slides — add images, icons, charts, or shapes
- **NEVER use accent lines under titles** — hallmark of AI-generated slides; use whitespace or background color instead
- Don't use low-contrast elements — check both icons and text against background

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Content QA

```bash
python -m markitdown output.pptx

# Check for leftover placeholders
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

### Visual QA

Convert to images, then inspect:

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

Inspect each slide image for:
- Overlapping elements (text through shapes, stacked elements)
- Text overflow or cutoff at edges/box boundaries
- Decorative lines misaligned when titles wrap to two lines
- Elements too close (< 0.3" gaps) or nearly touching
- Uneven gaps — large empty area vs. cramped sections
- Insufficient margins from slide edges (< 0.5")
- Misaligned columns or similar elements
- Low-contrast text or icons against background
- Leftover placeholder content

### Verification Loop

1. Generate → convert to images → inspect
2. List issues found (if none found, look again more critically)
3. Fix issues
4. Re-verify affected slides — one fix often creates another problem
5. Repeat until a full pass finds no new issues

**Do not declare success until at least one fix-and-verify cycle is complete.**

---

## Dependencies

- `pip install "markitdown[pptx]"` — text extraction
- `pip install Pillow` — thumbnail grids
- `npm install -g pptxgenjs` — creating from scratch
- LibreOffice (`soffice`) — PDF conversion (`scripts/office/soffice.py`)
- Poppler (`pdftoppm`) — PDF to images
