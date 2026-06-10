---
name: DOCX_GENERATOR
description: Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files) — includes reports, memos, letters, templates, tracked changes, and find-and-replace operations.
---

# DOCX Creation, Editing, and Analysis

## Quick Reference

| Task | Approach |
|---|---|
| Read / analyze content | `pandoc` or unpack for raw XML |
| Create new document | Use `docx-js` (see Creating New Documents) |
| Edit existing document | Unpack → edit XML → repack (see Editing Existing Documents) |
| Convert `.doc` to `.docx` | `python scripts/office/soffice.py --headless --convert-to docx document.doc` |

## Reading Content

```bash
# Text extraction with tracked changes
pandoc --track-changes=all document.docx -o output.md

# Raw XML access
python scripts/office/unpack.py document.docx unpacked/
```

---

## Creating New Documents

Install: `npm install -g docx`

### Critical Setup Rules

- **Always set page size explicitly** — docx-js defaults to A4; use US Letter (12240 × 15840 DXA) for US docs
- **Landscape:** pass portrait dimensions and set `orientation: PageOrientation.LANDSCAPE` — docx-js swaps internally
- **Never use `\n`** — use separate Paragraph elements
- **Never use unicode bullets** — use `LevelFormat.BULLET` with numbering config
- **PageBreak must be inside a Paragraph**
- **ImageRun requires `type`** — always specify `png`/`jpg`/etc.

### Tables

- **Tables need dual widths**: set `columnWidths` on the table AND `width` on each cell — both must match
- **Always use `WidthType.DXA`** — never `WidthType.PERCENTAGE` (breaks in Google Docs)
- **Table width = sum of columnWidths** — must add up exactly
- **Use `ShadingType.CLEAR`** — never SOLID for table cell shading (causes black backgrounds)
- **Never use tables as dividers/rules** — use Paragraph border instead

### Styles

```javascript
// Override built-in headings with exact IDs
{ id: "Heading1", name: "Heading 1", basedOn: "Normal",
  run: { size: 32, bold: true, font: "Arial" },
  paragraph: { outlineLevel: 0 } }  // outlineLevel required for TOC
```

### Lists

```javascript
// CORRECT: use numbering config
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
    ]
  }
});
// WRONG: never use "• Item" or "• Item" directly in TextRun
```

---

## Editing Existing Documents

Follow all 3 steps in order:

### Step 1: Unpack
```bash
python scripts/office/unpack.py document.docx unpacked/
```

### Step 2: Edit XML

- Use **Edit tool** for string replacement — not Python scripts
- Use **smart quotes** for new content: `&#x2018;` `&#x2019;` `&#x201C;` `&#x201D;`
- Use `"Claude"` as author for tracked changes unless user specifies otherwise

**Tracked Changes:**
```xml
<w:ins w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
<w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
```

**Comments:** Use `comment.py` to handle boilerplate:
```bash
python scripts/comment.py unpacked/ 0 "Comment text"
```

### Step 3: Pack
```bash
python scripts/office/pack.py unpacked/ output.docx --original document.docx
```

---

## Dependencies

- **pandoc** — text extraction
- **docx** — `npm install -g docx` (new documents)
- **LibreOffice** — PDF/image conversion (`scripts/office/soffice.py`)
- **Poppler** — `pdftoppm` for images
