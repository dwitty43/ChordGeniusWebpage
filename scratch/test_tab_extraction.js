const assert = require('assert');
const { extractTabData } = require('../backend/engine');

console.log("🎸 STARTING TAB EXTRACTION AND SANITIZATION TEST SUITE\n");

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ Passed: ${name}`);
    } catch (e) {
        console.error(`❌ Failed: ${name}`);
        console.error(e);
        process.exit(1);
    }
}

// 1. JSON-LD MusicRecording test
runTest("JSON-LD MusicRecording Extraction", () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "MusicRecording",
                    "name": "Hotel_California",
                    "byArtist": {
                        "@type": "MusicGroup",
                        "name": "Eagles"
                    }
                }
                </script>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

// 2. JSON-LD MusicComposition test
runTest("JSON-LD MusicComposition Extraction", () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "MusicComposition",
                    "name": "Eagles - Hotel California (chords)"
                }
                </script>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

// 3. Fallback Title tag test (Song Chords by Artist @ Ultimate-Guitar.Com)
runTest("Fallback Title Tag Extraction (Chords by Artist)", () => {
    const html = `
        <html>
            <head>
                <title>Hotel California Chords by Eagles @ Ultimate-Guitar.Com</title>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

// 4. Underscore sanitization test
runTest("Underscore Sanitization in Title Tag Fallback", () => {
    const html = `
        <html>
            <head>
                <title>Hotel_California_Chords_by_Eagles_@_Ultimate-Guitar.Com</title>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

// 5. JSON-LD Type Array test
runTest("JSON-LD MusicRecording Type Array Extraction", () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": ["MusicRecording", "Article"],
                    "name": "Hotel California",
                    "byArtist": {
                        "@type": "MusicGroup",
                        "name": "Eagles"
                    }
                }
                </script>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

// 6. JSON-LD Graph structure test
runTest("JSON-LD Graph Structure Extraction", () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@graph": [
                        {
                            "@type": "BreadcrumbList",
                            "name": "List"
                        },
                        {
                            "@type": "MusicRecording",
                            "name": "Hotel California",
                            "byArtist": {
                                "@type": "MusicGroup",
                                "name": "Eagles"
                            }
                        }
                    ]
                }
                </script>
            </head>
            <body>
                <pre>[Intro]
Bm F# A E G D Em F#</pre>
            </body>
        </html>
    `;
    const data = extractTabData(html);
    assert.strictEqual(data.songTitle, "Eagles - Hotel California");
});

console.log("\n✨ ALL TAB EXTRACTION TESTS PASSED SUCCESSFULLY!");
