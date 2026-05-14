---
name: THEOREM_WEB_01
description: web-search, google-docs, automation
---

# Logic Shift: THEOREM_WEB_01
Trace ID: TELEGRAM-1778790600151
Learned At: 2026-05-14T20:30:17.492Z

## Justification
The standard approach of simply performing a web search and then manually instructing the agent to copy to Google Docs can be inefficient. This theorem codifies a more direct method where the search results are immediately processed into a Google Doc, reducing the number of steps and potential for error. It leverages the integrated Google Docs capability more effectively.

## Discovered Pattern
User requests web search for specific items with a requirement to save to Google Docs.

## Optimized Approach
When a user requests a web search for specific items and also requires saving the results to Google Docs, prioritize using the browser tool to perform the search and extract data. After obtaining the necessary information, use the 'google_docs__create_document' tool to create a new document, populate it with the extracted data, and save it to Google Drive. This ensures a streamlined workflow by directly integrating search results into the desired document format, avoiding intermediate manual copying or redundant steps.
