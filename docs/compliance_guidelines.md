# ⚖️ ChordGenius Legal & Technical Compliance Guidelines

This document details the transition of ChordGenius from an automated web scraping/catalog search model to a user-driven, client-only paste-and-convert utility. This architectural shift ensures compliance with licensing terms of copyright holders (e.g., Ultimate Guitar, E-Chords) while maintaining full client-side transposition and setlist construction capabilities.

---

## 🔄 The Compliance Shift: Web Scraping vs. Copy-Paste

Previously, ChordGenius featured backend scrapers that queried DuckDuckGo, Ultimate Guitar, and E-Chords directly to extract chord charts. Due to copyright restrictions and automated bot-detection safeguards (e.g., Cloudflare browser challenges), the server-side scraping endpoints have been disabled.

*   **Before**: The application fetched chord charts automatically via Puppeteer and Scraping APIs based on a song search string.
*   **After**: The application acts as a client-side conversion, transposition, and formatting utility. Users copy the text of their licensed chord charts, paste them into the "Paste & Convert" interface, and ChordGenius processes the transposition and outputs formatted charts.

---

## 📂 Standalone Scraping Repository: ChordGeniusWScraping

To ensure zero loss of legacy IP and to allow personal scraping use, the entire original scraping-enabled codebase has been moved to a separate standalone repository:
*   **Location**: `c:\Users\Dwitt\Projects\ChordGeniusWScraping`
*   **State**: Reset to the exact commit prior to disabling the scraping engine (`bd1d8ddd1c67e81d68ff8a8ceef58d9e01276cd5`).

### How to Run the Scraping Repository
If you are running the scraping version of ChordGenius in an isolated, private environment:
1.  Navigate to the repository folder: `c:\Users\Dwitt\Projects\ChordGeniusWScraping`
2.  Ensure your `.env` file contains the required API keys:
    ```bash
    ZENROWS_API_KEY=your_key
    SCRAPINGBEE_API_KEY=your_key
    USE_SCRAPING_API=true
    ```
3.  Install all dependencies:
    ```bash
    npm install
    ```
4.  Start the scraping application:
    ```bash
    npm run dev
    ```

---

## 🛠️ Summary of Code Modifications

### 1. Backend Server (`backend/server.js`)
*   **Scraper Blocking**: Added immediate 403 Forbidden interceptors to `GET /api/convert` and `GET /api/preview` with the JSON payload:
    ```json
    { "error": "Scraping has been disabled for legal compliance. Please use the Paste & Convert tool instead." }
    ```
*   **Paste-Preview Endpoint**: Added a new route `POST /api/paste-preview` which processes user-submitted text:
    *   Parameters: `{ text, title, originalKey, targetKey, simplify, capo, bpm, timeSignature }`
    *   Engine processing: Passes `text` through `processAndAlignTabs()` and calculates `playKey` using `getPlayKey()` if a capo is applied.

### 2. Frontend Interface (`public/index.html`)
*   **Console UI Transformation**: Renamed "Search & Convert" to "Paste & Convert" with a clipboard icon.
*   **Paste Area**: Added a monospace, dark-themed `<textarea id="pasteChartText">` below the input fields.
*   **Action Flow**:
    *   Validation: The "Convert" button validates that `#pasteChartText` is not empty.
    *   Network Request: Sends a `POST` request with JSON payload to `/api/paste-preview`.
    *   State & Storage: Loads the returned data, updates `localStorage.cg_active_song` (retaining the `originalText`), and enables preview and download actions.
*   **History & Restores**:
    *   The "Scrape Again" list header is now "Convert Again".
    *   History items store the original pasted text block (`originalText`), which is loaded back into `#pasteChartText` when the user clicks a history card.
    *   Active song restoration correctly populates `#pasteChartText` on page load.
