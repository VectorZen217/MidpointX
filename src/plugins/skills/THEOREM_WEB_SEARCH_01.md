---
name: THEOREM_WEB_SEARCH_01
description: web scraping, search optimization, multi-location search
category: domain
---

# Logic Shift: THEOREM_WEB_SEARCH_01
Trace ID: TELEGRAM-1778778893703
Learned At: 2026-05-14T17:15:45.961Z

## Justification
The previous attempts using `execute_system_command` for web searching were unsuccessful, indicating a limitation in that approach for directly fetching and parsing web content. The `fetch__fetch` tool provides a more direct and reliable method for retrieving raw HTML content from search engine results pages. This theorem codifies the successful strategy of using `fetch__fetch` for web scraping and emphasizes constructing a precise search query to maximize the chances of relevant results in a single pass.

## Discovered Pattern
Web search for specific items (e.g., used vehicles, real estate) across multiple geographic locations.

## Optimized Approach
When performing web searches for specific items across multiple locations, construct a single, comprehensive search query that includes all relevant keywords and location names. Utilize a search engine known for its robust API or scraping capabilities (like DuckDuckGo's HTML version) to fetch the search results page. Parse the HTML to extract relevant information (e.g., item name, price, URL, location). If the initial search yields too many results or is too broad, refine the search by adding more specific keywords or by performing separate searches for each location and then consolidating the results.
