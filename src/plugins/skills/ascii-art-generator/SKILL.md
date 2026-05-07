---
name: ascii-art-generator
description: Creates ASCII art text banners and saves them to files. Use when the user asks to generate ASCII art, text banners, or decorative headers.
---

# ASCII Art Generator

This skill generates ASCII art text banners and saves them to a file.

## Usage

To generate ASCII art, use the `scripts/generate_ascii.js` script.

### Command

```bash
node scripts/generate_ascii.js "<text>" "<output_filename>"
```

### Parameters

- `<text>`: The text string to convert to ASCII art. Surround with quotes.
- `<output_filename>`: The path where the ASCII art file should be saved (e.g., `banner.txt`).

### Example

User: "Create a banner that says HELLO and save it to hello.txt"

Agent executes:
```bash
node scripts/generate_ascii.js "HELLO" "hello.txt"
```
## Reflect & Learn
- [ ] **Reflect & Learn**: Log task outcome to .memory/ using the self-improvement signal schema.
