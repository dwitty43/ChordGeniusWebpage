# 🎓 Skill: ChordGenius Backend Architecture, Transposition Engine & Scraper Hardening

This document defines the official codebase architecture, standards, and algorithms for the ChordGenius Node.js Express backend and transposition engine. Referencing this skill enables future development agents to immediately write compliant endpoints, optimize scraper evasion, and maintain the integrity of the transposition mathematics.

---

## 📂 Backend File Architecture
*   [backend/server.js](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/backend/server.js): Express REST API routing, Spotify Client Credentials flow, multi-format upload controllers, and static client serving.
*   [backend/engine.js](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/backend/engine.js): The core engine containing Ultimate Guitar scrapers, ChordPro/text format converters, Nashville transposition logic, Circle of Fifths math, and PDF/Word/SVG document compilers.

---

## 🔄 Core Algorithms & Mathematics

### 1. Transposition & Nashville Number Engine (`engine.js`)
*   **Pitch Class Maps**: Chords are mapped to numerical pitches (0-11) using semitone indices.
*   **Alignment Preservation**: When transposing, chords must align perfectly with the text beneath them. The engine computes space offsets dynamically during token replacement.
*   **Capo Logic**: The engine shifts the play key down by the capo fret value:
    $$\text{Play Key} = \text{Target Key} - \text{Capo Semitones}$$
*   **Simplify Rules**: Reduces complex chord extensions (e.g. $C^{\text{maj9}} \to C^{\text{maj7}}$ or $C$, $D7/F\# \to D/F\#$) to ease playing for beginner musicians.

### 2. Circle of Fifths Distance & Transition Remedies (`engine.js`)
*   **Coordinate System**: Major keys and their relative minors share a coordinate (0-11) on the Circle of Fifths:
    *   $C$ / $Am \to 0$
    *   $G$ / $Em \to 1$
    *   $F$ / $Dm \to 11$ (calculated as $-1 \pmod{12}$)
*   **Distance Formula**: The shortest step distance on the circle between two keys $K_1$ and $K_2$:
    $$\text{Distance} = \min(|C_1 - C_2|, 12 - |C_1 - C_2|)$$
*   **Jarring Threshold**: Transition distances $\ge 3$ are considered jarring.
*   **Remedy Search**: Finds intermediate keys to recommend that have a distance $< 3$ from both origin and target keys, sorting by the minimum semitone transposition.

---

## 🔒 Scraper Hardening & Evasion (`engine.js`)

When scraping Ultimate Guitar (`ultimate-guitar.com`), direct server-side requests are blocked by Cloudflare.
1.  **Stealth Configurations**: Puppeteer must use `puppeteer-extra-plugin-stealth` and rotate user-agents.
2.  **API Proxies**: If configured (`USE_SCRAPING_API=true`), all Ultimate Guitar HTML fetches MUST route through ZenRows or ScrapingBee endpoints to bypass CAPTCHAs and blocks.
3.  **UG Data Extraction**: The raw chord charts are extracted by searching the HTML for `window.UGAPP.store.page` script blocks containing the JSON data payload. Never rely on DOM selectors which break frequently.
4.  **Direct URL Bypassing**: If the search query is a direct `tabs.ultimate-guitar.com` URL (with or without `https://`), the engine bypasses search catalog lookup, formats the URL properly, and directly scrapes or fetches it.
5.  **Song Title Resolution & Underscore Sanitization**: The scraped HTML is parsed to extract clean song titles:
    *   **JSON-LD Parsing**: Script tags with `type="application/ld+json"` are scanned. If a `MusicRecording` type is found, it formats as `"Artist - Title"`. If a `MusicComposition` type is found, it extracts the name and strips trailing `(chords)`.
    *   **Title Tag Fallback**: If JSON-LD doesn't yield a title, it extracts the `<title>` tag and formats it (e.g. `"Song Chords by Artist @ Ultimate-Guitar.Com"` becomes `"Artist - Song"`).
    *   **Sanitization Rule**: All underscores (`_`) are replaced with spaces (` `) and trimmed. This is applied to all titles before delivering files or returning JSON previews. In `deliverFile`, the filename keeps its underscore structure while the rendered title inside the document uses spaces.

---

## 🎵 Spotify Integration (`server.js`)
*   **Token Caching**: Spotify access tokens are fetched using Client Credentials flow and cached in memory with a timestamp check (`Date.now() < spotifyTokenExpiry`).
*   **BPM & Key Autodetect**: Searching a track retrieves its ID, queries `/v1/audio-features`, and maps the integer key/mode to a musical key name (e.g., $9 \text{ mode } 0 \to \text{F\#m}$).

---

## 📋 Standard API Routes

| Endpoint | Method | Input Parameters | Output Format | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/convert` | GET | `q`, `key`, `targetKey`, `format`, `simplify`, `capo`, `voicing` | Binary File (`.docx`, `.pdf`, `.pro`) | Scrapes, transposes, and downloads a song chart. |
| `/api/preview` | GET | `q`, `key`, `targetKey`, `simplify`, `capo` | JSON | Returns transposed text metadata along with `originalText` (raw scraped text) for live editor preview. |
| `/api/transpose` | POST | `{ text, originalKey, targetKey, capo, simplify }` | JSON | Transposes a raw text block on the fly. |
| `/api/transition-remedies` | GET | `key1`, `key2` | JSON | Calculates Circle transition distances and recommends capos/keys. |
| `/api/import` | POST | Multipart Form (`chartFile`, `key`, `targetKey`, `format`, `capo`, `voicing`) | Binary File | Extracts text from uploaded PDF/Word/ChordPro, transposes, and downloads. |
| `/api/import-preview` | POST | Multipart Form (`chartFile`, `key`, `targetKey`, `simplify`, `capo`) | JSON | Extracts, transposes, and returns text metadata with `originalText` (raw imported text) for previewing. |
| `/api/chord-svg` | GET | `chord`, `voicing` (`guitar` or `piano`) | SVG XML | Generates inline SVG of chord shapes. |
| `/api/spotify/playlist-import` | POST | `{ playlistId, playlistUrl, limit, offset }` | JSON | Paginated track import (max 15) with auto-detected BPMs/keys. |

---

## 💡 Guidelines for Future Development Agents

1.  **Always Check Environment Dependencies**: Local tests running Puppeteer require Chromium. Production builds on server environments should default to API scraping proxies to conserve RAM.
2.  **Verify Transposition Math**: Run `node scratch/test_music_engine.js` after making any modifications to the transpose algorithms in `engine.js`.
3.  **Path Safety**: When serving or reading files, always use `path.join(__dirname, ...)` relative paths instead of hardcoded strings to ensure cross-platform Windows/Unix compatibility.

> [!NOTE]
> **Dynamic Skill Creation & Maintenance**: As new features, subsystems, or workflows are established (e.g. databases, payment flows, or advanced authentication), developer agents are encouraged and authorized to create new skill documentation files in the `skills/` directory.
> **Self-Updating Codebase:** Whenever you add new functionality, expand APIs, or change layouts, you MUST update the corresponding skill documentation files (like `backend_and_scraper_skill.md` or `frontend_and_styling_skill.md`) to keep them current. This prevents the documentation from decaying and maintains low-token efficiency.

---
*Created by Antigravity. To run backend tests, verify endpoints, or implement new API features, open this file with IsSkillFile: true.*
