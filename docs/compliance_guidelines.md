# ⚖️ ChordGenius Legal & Technical Compliance Guidelines

This document details the transition of ChordGenius from an automated web scraping/catalog search model to a user-driven, client-only paste-and-convert utility. This architectural shift ensures compliance with licensing terms of copyright holders (e.g., Ultimate Guitar, E-Chords) while maintaining full client-side transposition and setlist construction capabilities.

---

## 🔄 The Compliance Shift: Web Scraping vs. Copy-Paste

Previously, ChordGenius featured backend scrapers that queried DuckDuckGo, Ultimate Guitar, and E-Chords directly to extract chord charts. Due to copyright restrictions and automated bot-detection safeguards (e.g., Cloudflare browser challenges), the server-side scraping endpoints have been disabled.

*   **Before**: The application fetched chord charts automatically via Puppeteer and Scraping APIs based on a song search string.
*   **After**: The application acts as a client-side conversion, transposition, and formatting utility. Users copy the text of their licensed chord charts, paste them into the "Paste & Convert" interface, and ChordGenius processes the transposition and outputs formatted charts.

---

## 📂 Backup Registry

To ensure zero loss of legacy IP and reference implementations, exact copies of the original scraping-enabled backend modules were created prior to modification.

### Backup Locations
*   **`backend/server.backup.js`**: Contains the original Spotify metadata integration and search-based endpoints (`GET /api/convert` and `GET /api/preview`).
*   **`backend/engine.backup.js`**: Contains the full Puppeteer-extra-stealth catalog search engine, DDG Lite parser, E-Chords fallback, and Google Web Cache fetch logic.

### How to Restore the Scraping Engine
If you are running ChordGenius in an isolated, private environment where scraping is legally permitted and configured with ZenRows/ScrapingBee keys, you can restore scraping functionality:

1.  **Overwriting Server**: Replace `backend/server.js` with `backend/server.backup.js`.
2.  **Overwriting Engine**: Replace `backend/engine.js` with `backend/engine.backup.js`.
3.  **Environment Variables**: Ensure your `.env` contains the required keys:
    ```bash
    ZENROWS_API_KEY=your_key
    SCRAPINGBEE_API_KEY=your_key
    USE_SCRAPING_API=true
    ```
4.  **Install Puppeteer**: If not already present, ensure Puppeteer and stealth dependencies are installed:
    ```bash
    npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
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
