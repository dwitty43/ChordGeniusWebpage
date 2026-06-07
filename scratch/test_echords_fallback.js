const assert = require('assert');
const puppeteer = require('puppeteer-extra');
const { extractAnyTabData, getFirstSearchResult } = require('../backend/engine');

console.log("🎸 STARTING E-CHORDS FALLBACK AND SCRAPER TEST SUITE\n");

function runTest(name, fn) {
    try {
        fn();
        console.log(`\u001b[32m✅ Passed: ${name}\u001b[0m`);
    } catch (e) {
        console.error(`\u001b[31m❌ Failed: ${name}\u001b[0m`);
        console.error(e);
        process.exit(1);
    }
}

// 1. extractAnyTabData with E-Chords HTML containing JSON-LD
runTest("extractAnyTabData - E-Chords URL JSON-LD Extraction", () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "MusicComposition",
                    "name": "Yellow",
                    "musicalKey": "B",
                    "byArtist": {
                        "@type": "MusicGroup",
                        "name": "Coldplay"
                    }
                }
                </script>
            </head>
            <body>
                <pre>[Intro]
B  F#  E  B</pre>
            </body>
        </html>
    `;
    const data = extractAnyTabData(html, "https://www.e-chords.com/chords/coldplay/yellow");
    assert.strictEqual(data.songTitle, "Coldplay - Yellow");
    assert.strictEqual(data.songKey, "B");
    assert.strictEqual(data.rawTabText, "[Intro]\nB  F#  E  B");
    assert.strictEqual(data.sourceSite, "e-chords");
});

// 2. extractAnyTabData with E-Chords HTML using Title tag fallback
runTest("extractAnyTabData - E-Chords Title Fallback", () => {
    const html = `
        <html>
            <head>
                <title>Yellow Chords - Coldplay | E-CHORDS</title>
            </head>
            <body>
                <pre>[Intro]
B  F#  E  B</pre>
            </body>
        </html>
    `;
    const data = extractAnyTabData(html, "https://www.e-chords.com/chords/coldplay/yellow");
    assert.strictEqual(data.songTitle, "Coldplay - Yellow");
    assert.strictEqual(data.rawTabText, "[Intro]\nB  F#  E  B");
    assert.strictEqual(data.sourceSite, "e-chords");
});

// 3. extractAnyTabData routing to Ultimate Guitar
runTest("extractAnyTabData - routing to Ultimate Guitar", () => {
    const html = `
        <html>
            <head>
                <title>Yellow Chords by Coldplay @ Ultimate-Guitar.Com</title>
            </head>
            <body>
                <pre>[Intro]
B  F#  E  B</pre>
            </body>
        </html>
    `;
    const data = extractAnyTabData(html, "https://tabs.ultimate-guitar.com/tab/coldplay/yellow-chords-12345");
    assert.strictEqual(data.songTitle, "Coldplay - Yellow");
    assert.strictEqual(data.rawTabText, "[Intro]\nB  F#  E  B");
    assert.strictEqual(data.sourceSite, undefined); // extractTabData doesn't set sourceSite
});

// 4. getFirstSearchResult direct E-Chords URL
runTest("getFirstSearchResult - direct E-Chords URL routing", async () => {
    const url = "e-chords.com/chords/coldplay/yellow";
    const result = await getFirstSearchResult(url);
    assert.strictEqual(result, "https://e-chords.com/chords/coldplay/yellow");
});

// 5. getFirstSearchResult fall-through to E-Chords Search Fallback
async function runAsyncTests() {
    // Save original fetch and puppeteer launch
    const originalFetch = globalThis.fetch;
    const originalPuppeteerLaunch = puppeteer.launch;

    try {
        // Mock puppeteer launch to fail immediately to skip browser-based fallbacks
        puppeteer.launch = async () => {
            throw new Error("Mocked puppeteer launch failure for test speed");
        };

        // Mock global fetch
        globalThis.fetch = async (url, options) => {
            const urlStr = String(url);
            if (urlStr.includes("lite.duckduckgo.com/lite/")) {
                if (urlStr.includes("site%3Atabs.ultimate-guitar.com")) {
                    // UG search: return no results
                    return {
                        ok: true,
                        text: async () => `<html><body>No results found</body></html>`
                    };
                } else if (urlStr.includes("site%3Ae-chords.com")) {
                    // E-Chords search: return a matching E-Chords link
                    return {
                        ok: true,
                        text: async () => `
                            <html>
                                <body>
                                    <a href="https://lite.duckduckgo.com/lite/redirect?url=https%3A%2F%2Fwww.e-chords.com%2Fchords%2Fcoldplay%2Fyellow">Coldplay - Yellow Chords</a>
                                </body>
                            </html>
                        `
                    };
                }
            }
            return {
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async () => ""
            };
        };

        console.log("Running Test 5: getFirstSearchResult fall-through to E-Chords search fallback...");
        const result = await getFirstSearchResult("Coldplay Yellow");
        assert.strictEqual(result, "https://www.e-chords.com/chords/coldplay/yellow");
        console.log("\u001b[32m✅ Passed: getFirstSearchResult fall-through to E-Chords search fallback\u001b[0m");

    } catch (e) {
        console.error("\u001b[31m❌ Failed Test 5: getFirstSearchResult fall-through\u001b[0m");
        console.error(e);
        process.exit(1);
    } finally {
        // Restore
        globalThis.fetch = originalFetch;
        puppeteer.launch = originalPuppeteerLaunch;
    }

    console.log("\n✨ ALL E-CHORDS FALLBACK TESTS PASSED SUCCESSFULLY!");
}

runAsyncTests();
