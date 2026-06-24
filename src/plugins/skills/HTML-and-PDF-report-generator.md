---
name: html-pdf-report-generator
description: 'Comprehensive framework for building automated HTML and PDF report generation pipelines. Covers tooling choices (Python/Jinja2/WeasyPrint, Node.js/Puppeteer, PowerShell, Quarto), CSS print layout engineering, data visualization embedding, and delivery automation. In MidpointX, use filesystem__write_text_file to save HTML locally and google_workspace__upload_file to push reports to Drive. Use this skill when building reproducible document generation systems, integrating data visualizations into reports, or automating report scheduling and distribution. When to use: Creating automated report pipelines; implementing reproducible document generation; building enterprise reporting systems; integrating data and visualizations into static/interactive documents; setting up scheduled report distribution. When NOT to use: Single ad-hoc report creation without automation; simple static HTML pages; debugging existing reporting tools; performance-tuning an existing proven pipeline.'
category: domain
---

# Automated HTML and PDF Report Generation

This skill details the architectural frameworks, tools, and engineering standards for building reproducible report generation systems that produce dynamic documents in HTML and PDF formats, complete with custom styling, data visualizations, and automated delivery.

---

## MidpointX Integration

When generating reports inside MidpointX, use these tool calls:

| Action | Tool | Key Parameters |
|---|---|---|
| Save HTML to disk | `filesystem__write_text_file` | `path`, `content` |
| Upload HTML to Google Drive | `google_workspace__upload_file` | `name`, `content`, `mime_type: "text/html"` |
| Upload PDF to Google Drive | `google_workspace__upload_file` | `name`, `content` (base64), `mime_type: "application/pdf"` |
| Render HTML → PDF via browser | `puppeteer__*` MCP tools | Launch headless Chrome, navigate, `page.pdf()` |
| Save to a specific Drive folder | `google_workspace__upload_file` | Include `folder_id` param |
| Create a Drive folder for reports | `google_workspace__create_folder` | `name`, optional `parent_folder_id` |

**Recommended stack for MidpointX:** Node.js + Puppeteer (Puppeteer MCP server is already active). Use `filesystem__write_text_file` to write the HTML, then use the Puppeteer MCP to load the file and call `page.pdf()` for PDF output.

---

## Quick-Start Decision Tree

**Choose your technology based on requirements:**

| Requirement | Best Choice | Rationale |
|---|---|---|
| Pure Python data pipeline | Pandas + Jinja2 + WeasyPrint | Lightweight, no JS engine needed |
| Interactive charts in HTML | Plotly.js + Puppeteer | Rich interactivity, browser rendering |
| Scientific/reproducible documents | Quarto + R/Python | Executable code + narrative + output |
| Enterprise IT reporting | PowerShell + ConvertTo-Html | Native Windows, object pipeline |
| Complex visual layouts | Node.js + Puppeteer + CSS | Maximum design control |
| Static PDFs, no dependencies | Jinja2 + wkhtmltopdf | Fast, minimal setup |

---

## Prerequisites & Environment Setup

Before implementing a report generation pipeline, ensure:

- **Basic programming knowledge** in your target language (Python, R, PowerShell, or Node.js)
- **Templating fundamentals** (HTML structure, CSS layout, variable substitution)
- **Data preparation capability** (cleaning/aggregating data into structured formats)
- **System administration access** for scheduling (Task Scheduler, cron, or cloud event triggers)
- **Email/SMTP configuration** for automated distribution
- **Disk space** for storing generated PDFs and temporary files

---

## 1. Architectural Frameworks & Core Principles

Modern enterprise and scientific report generation relies on **reproducibility** and **decoupled architectures**.

**Separation of Concerns:** A robust reporting pipeline separates computational data analysis from presentation layouts. Embedding presentational formatting directly into database queries creates fragile pipelines. Instead, raw data is cleaned and aggregated in an analytical layer before being passed as a structured payload to a dedicated templating system.

**Reproducibility:** The ability to easily update reports when new data arrives is central to automated document compilation frameworks.

---

## 2. Tooling Ecosystems by Environment

### A. Python Pipelines (Pandas + Jinja2 + Rendering Engines)

Python environments typically rely on a combination of **Pandas** (for data manipulation) and **Jinja2** (for document layout and compilation).

**Data Aggregation:** Pandas is used to aggregate data and output HTML table fragments via its built-in serialization utilities.

**Templating:** Jinja2 compiles templates from the local file system or in-memory strings, dynamically replacing placeholders (`{{ variable }}`) with actual data and utilizing conditionals/loops for dynamic content.

**PDF Rendering:**

**WeasyPrint:** A native document compiler written in Python that is lightweight and excellent for text-heavy, CSS-paged layouts, though it cannot compile client-side JavaScript charts.

**pdfkit:** A Python wrapper for `wkhtmltopdf` that parses HTML/CSS at a native system level, providing fast compilation for standard data tables.

### B. Polyglot & Scientific Frameworks (R Markdown & Quarto)

For data science and research, **R Markdown** and **Quarto** provide reproducible document generation pipelines that weave executable code chunks (R, Python, Julia, Observable JS) with narrative prose.

**Compilation:** The engine (Knitr or Jupyter) executes the code, captures outputs (charts, tables), and uses Pandoc to convert the intermediate Markdown into HTML or PDF.

**Quarto Configuration:** Configuration is handled via YAML metadata headers. For self-contained HTML (bundling all images and CSS into one file), set `embed-resources: true`. For high-quality PDFs supporting Unicode, Quarto utilizes LaTeX (e.g., TinyTeX) with the `xelatex` engine.

### C. System Administration Reporting (PowerShell)

For IT environments, PowerShell utilizes an object-oriented pipeline to parse diagnostic outputs and compile them into reports.

**ConvertTo-Html:** The core cmdlet formats object streams into HTML. By using the `-Fragment` parameter, developers can emit raw `<table>` bodies without the HTML wrapper, allowing multiple fragments to be injected into a master template.

**Styling:** External CSS can be linked using the `-CssUri` parameter, or internal styles can be injected via the `-Head` parameter.

### D. Node.js & JavaScript Compilers

If your report relies heavily on modern CSS, web fonts, or interactive JavaScript graphics, Node.js libraries provide the highest visual fidelity.

**Headless Browsers (Puppeteer & Playwright):** These orchestrate headless Chromium instances to render HTML exactly as it appears in a browser, making them ideal for complex, visually rich reports with dynamic JavaScript charts.

**Programmatic PDF Generation (jsPDF & PDFKit):** For generating PDFs directly from data without a browser engine, `jsPDF` (client-side) and `PDFKit` (Node-first) allow precise, coordinate-based rendering of shapes and text. Use `html2canvas` alongside `jsPDF` to capture HTML layouts and convert them into image-based PDFs.

---

## 3. Integrating Graphics & Data Visualization

Visualizations transform complex datasets into digestible insights. When generating reports, you must account for whether the output is an interactive HTML page or a static PDF document.

### Selecting a Charting Library

**Chart.js:** Utilizes HTML5 Canvas rendering. Easy to use, responsive, and performs well for moderate datasets.

**Plotly.js:** Excels at scientific, statistical, and 3D visualizations using SVG/WebGL. Provides rich interactivity (hover info, zoom).

**D3.js:** Manipulates the DOM directly to create highly customized, complex, logic-driven vector layouts.

**ApexCharts:** Leverages hybrid SVG/Canvas rendering, providing smooth animations out-of-the-box.

### Embedding Strategies for HTML vs. PDF

**Interactive HTML Reports:** JavaScript libraries render seamlessly in browsers. When templating with Jinja2, pass dynamic data to JS by injecting it into an inline `<script>` block or using HTML5 data attributes (e.g., `<div data-chart-metrics="{{ data }}">`) to maintain a clean separation of concerns.

**Static PDF Reports:**

**Vector Scaling:** Vector-based libraries (ApexCharts, D3.js) produce SVGs that scale perfectly in PDFs without sacrificing quality.

**Browser Rendering:** If using Headless Browsers (Puppeteer/Playwright), ensure animations are disabled (e.g., `animations: { enabled: false }`) so the PDF captures the fully rendered static chart snapshot.

**Pre-rendering Images:** For PDF compilers without a JS engine (like WeasyPrint), generate charts offline as static images (PNG, SVG) or Base64 strings and inject the static image tags into the HTML template.

**Image Optimization:** Keep image file sizes under 100 KB where possible. Use **PNG** for screenshots, logos, and charts with sharp text; **JPG** for photographic images; **SVG** for resolution-independent icons. Ensure descriptive `alt` tags on all images for accessibility.

---

## 4. CSS Print Layout Engineering

A report must look professional on a screen (HTML) and on paper (PDF). Screen-focused styles can cause severe layout issues when printed, making responsive design and print-specific CSS essential.

### Responsive Grid Layouts

To display dashboard interfaces across multiple device sizes, utilize flexible grid systems like **CSS Grid**, **Flexbox**, or the **Bootstrap 12-column grid**. Responsive frameworks ensure elements scale dynamically from mobile viewports to wide displays.

### Physical Page Control (`@media print`)

When exporting to PDF, define print-friendly overrides inside a `@media print` CSS block.

**Hiding Unnecessary Elements:** Hide navigation bars, buttons, scrollbars, and interactive UI components to declutter the printed page.

**Page Breaks:** Prevent content from splitting awkwardly across physical pages.

Force a section to start on a new page using `page-break-before: always`.

**Table Row Splitting:** To avoid a single row of text splitting across a page boundary, apply `page-break-inside: avoid` to table rows (`tr`, `td`, `th`). Ensure that parent elements have `display: block` applied to ensure these break rules are respected.

**Consistent Margins:** Browsers apply unpredictable default margins when printing. Use the `@page` rule to explicitly set standardized physical margins (e.g., A4 or Letter sizes).

**Typography and Branding:** Incorporate custom web fonts (Google Fonts or self-hosted `@font-face`) to maintain brand identity. Use the `font-display: block` parameter to ensure headless compilers wait for fonts to load before rendering the PDF. Use print-appropriate font sizes (10pt–12pt for body text).

---

## 5. Automation and Delivery Logistics

Once the report compilation pipeline is built, the final step is automating execution and distributing the results securely.

### Scheduling

Operational scripts should be automated using system-level task schedulers (Windows Task Scheduler, Linux `cron`) or cloud-based event triggers (AWS Lambda, GitHub Actions). Include robust error handling and logging (timestamps, row counts, exceptions) to monitor system health and database timeouts.

### Email Distribution

Automated HTML and PDF reports are commonly delivered via secure SMTP.

**PowerShell Method:** `Send-MailMessage` is deprecated in PowerShell 7 due to a lack of TLS 1.2 support. Modern workflows rely on Microsoft Graph SDK (`Send-MgUserMail`) or third-party CLI tools (e.g., Nylas CLI) that support modern OAuth and HTML bodies.

**Python Method:** Utilize `smtplib` and `email.mime` libraries to transmit multi-part email payloads.

**Attachment Limits:** Enterprise mail servers strictly cap emails at **10 MB** (including attachments). If your generated PDFs exceed this limit, either compress them into ZIP archives, or upload the PDF to secure cloud storage and email recipients an authenticated access link instead.

---

## 6. Common Pitfalls & Troubleshooting

### Issue: PDF renders but content is cut off or misaligned

**Causes:** Print margins not defined, viewport meta tag missing, or conflicting CSS for screen vs. print.

**Solutions:**
- Define explicit `@page` margins: `@page { margin: 0.75in; }`
- Ensure responsive viewport: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Test print preview in browser before programmatic rendering
- Use `page-break-inside: avoid` on critical sections

### Issue: Charts/images don't appear in PDF

**Causes:** Relative image paths broken during compilation, images not embedded, or async rendering issues.

**Solutions:**
- Use absolute URLs or Base64-encoded images for portability
- For Puppeteer: ensure `waitUntil: 'networkidle2'` to wait for lazy-loaded images
- Pre-render charts to static files (PNG/SVG) in your data layer before templating
- Check browser console logs in headless rendering for failed resource loads

### Issue: Custom fonts not loading in PDF

**Cause:** `@font-face` CSS block not processed before PDF rendering, or font files not accessible to headless browser.

**Solutions:**
- Embed fonts using Base64 in CSS: `src: url(data:application/font-woff;base64,...)`
- Use Google Fonts CDN: `@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700');`
- Ensure `font-display: block` to force wait before rendering

### Issue: Scheduled reports fail silently

**Cause:** Task scheduler/cron runs in a different environment (different PATH, user permissions, or working directory).

**Solutions:**
- Always use absolute file paths in scripts
- Log all errors to a dedicated log file: `2>&1 | tee -a /var/log/reports.log`
- Test schedule execution manually from the system account first
- Include timeout handling for long-running queries
- Set up email alerts on job failure

### Issue: Email attachment too large or bounces

**Cause:** PDF exceeds attachment size limits (10 MB typical for enterprise), or file encoding issues.

**Solutions:**
- Compress PDF: `ghostscript -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH -dDetectDuplicateImages -r150 -o compressed.pdf large.pdf`
- Split report across multiple emails or pages
- Upload to cloud storage and email a link instead of an attachment
- Optimize images before embedding: reduce resolution, convert to optimized formats

### Issue: Data doesn't appear in report, or shows stale values

**Cause:** Template variables not properly substituted, or data aggregation query still running when template renders.

**Solutions:**
- Add debugging: print interpolated variables to console/log before PDF generation
- Verify data structure matches template variable names (case-sensitive)
- Add explicit wait/timeout for database queries to complete
- Use data validation: `assert df.shape[0] > 0, "No data returned from query"`

---

## 7. Implementation Checklist

- [ ] **Architecture Phase**
  - [ ] Define report scope, frequency, and audience
  - [ ] Choose technology stack based on decision tree
  - [ ] Design data schema and aggregation queries
  - [ ] Plan CSS for both screen and print rendering

- [ ] **Development Phase**
  - [ ] Create template files (HTML + CSS)
  - [ ] Implement data aggregation layer
  - [ ] Test with sample data
  - [ ] Add graphics/charts with proper embedding strategy
  - [ ] Validate print CSS and page breaks
  - [ ] Test font loading and image rendering

- [ ] **Testing Phase**
  - [ ] Generate sample PDFs/HTML in all supported browsers
  - [ ] Verify accessibility (alt text, color contrast)
  - [ ] Test with edge cases (empty data, very large datasets)
  - [ ] Stress test: measure generation time and memory usage
  - [ ] Check file sizes and compression

- [ ] **Deployment Phase**
  - [ ] Set up scheduling (Task Scheduler/cron/Lambda)
  - [ ] Configure email distribution with error handling
  - [ ] Implement logging and monitoring
  - [ ] Test end-to-end in production environment
  - [ ] Set up alerts for job failures

- [ ] **Maintenance Phase**
  - [ ] Monitor performance metrics (generation time, file size trends)
  - [ ] Review logs regularly for errors or edge cases
  - [ ] Update data queries as upstream schemas change
  - [ ] Test new library versions before upgrading

---

## 8. Practical Implementation Patterns

### Pattern 1: Python Pipeline (Pandas + Jinja2 + WeasyPrint)

**Use case:** Data-driven reports with tables, simple charts, no JavaScript.

```python
import pandas as pd
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS

# 1. Aggregate data
data = pd.read_sql("SELECT * FROM sales WHERE date >= DATE_SUB(NOW(), INTERVAL 7 DAY)", connection)
summary = {
    'total_revenue': data['amount'].sum(),
    'avg_transaction': data['amount'].mean(),
    'row_count': len(data),
    'table_html': data.to_html(classes='report-table', index=False)
}

# 2. Render template
env = Environment(loader=FileSystemLoader('templates'))
template = env.get_template('sales_report.html')
html_content = template.render(summary=summary)

# 3. Generate PDF
HTML(string=html_content).write_pdf('report.pdf',
    stylesheets=[CSS('templates/print.css')])
```

### Pattern 2: Quarto Scientific Report (R/Python + Executable Code)

**Use case:** Research reports where code, analysis, and narrative interweave.

Create `report.qmd`:

```yaml
---
title: "Monthly Analytics Report"
format:
  pdf:
    toc: true
    number-sections: true
    mainfont: "Calibri"
    geometry: margin=0.75in
  html:
    embed-resources: true
---
```

Add executable code chunks after the YAML header:

```python
import pandas as pd
df = pd.read_csv('data.csv')
print(f"Total Records: {len(df)}")
print(df.describe())
```

Then render: `quarto render report.qmd`

### Pattern 3: PowerShell Report with HTML Fragments

**Use case:** Windows environment system diagnostics or inventory reports.

```powershell
# Build multiple report fragments
$processes = Get-Process | Select-Object Name, WorkingSet, Handles | ConvertTo-Html -Fragment
$services = Get-Service | Where-Object {$_.Status -eq 'Running'} | ConvertTo-Html -Fragment

# Combine into master template
$htmlBody = @"
<html>
<head>
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    @media print {
      body { margin: 0.75in; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>System Report - $(Get-Date -Format 'yyyy-MM-dd')</h1>
  <h2>Running Processes</h2>
  $processes
  <h2>Active Services</h2>
  $services
</body>
</html>
"@

$htmlBody | Out-File -FilePath "report.html" -Encoding UTF8
```

### Pattern 4: Node.js + Puppeteer (Complex Layouts)

**Use case:** Reports requiring modern CSS or JavaScript interactivity. In MidpointX, the Puppeteer MCP server handles this.

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Load HTML with inline data
  const htmlContent = fs.readFileSync('template.html', 'utf8');
  await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

  // Generate PDF with print-optimized settings
  await page.pdf({
    path: 'report.pdf',
    format: 'A4',
    margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
    displayHeaderFooter: true,
    headerTemplate: '<span style="font-size: 10px;">Report</span>',
    footerTemplate: '<span style="font-size: 10px;"><span class="pageNumber"></span>/<span class="totalPages"></span></span>'
  });

  await browser.close();
})();
```

---

## References

- **Python:** Pandas, Jinja2, WeasyPrint, pdfkit/wkhtmltopdf, Plotly
- **Scientific:** R Markdown, Quarto, Knitr, Pandoc
- **PowerShell:** ConvertTo-Html, Microsoft Graph SDK (Send-MgUserMail), Windows Task Scheduler
- **Node.js:** Puppeteer, Playwright, html2canvas, jsPDF, PDFKit
- **CSS Print:** `@media print`, `@page` rule, `page-break-before/after`, `page-break-inside`
- **Charts:** Chart.js, Plotly.js, D3.js, ApexCharts
- **Email/Delivery:** SMTP, OAuth 2.0, ZIP compression, cloud storage links
