const assert = require('assert');
const { cleanWhitespace, getFirstSearchResult } = require('../backend/engine');

console.log("🎸 STARTING CHORD GENIUS NEW FEATURES TEST SUITE\n");

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

// 1. cleanWhitespace Tests
runTest("cleanWhitespace - Tab Conversion", () => {
    const input = "C\t\tG\tAm\tF";
    const expected = "C        G    Am    F"; // C + 2*4 spaces + G + 4 spaces + Am + 4 spaces + F
    const result = cleanWhitespace(input);
    assert.strictEqual(result, expected);
});

runTest("cleanWhitespace - Trailing Whitespace Trimming & Leading Space Preservation", () => {
    const input = "   C     G    \n  Intro:    \nLyric line   ";
    const expected = "   C     G\n  Intro:\nLyric line";
    const result = cleanWhitespace(input);
    assert.strictEqual(result, expected);
});

runTest("cleanWhitespace - Limit Consecutive Empty Lines", () => {
    const input = "Line 1\n\n\n\nLine 2\n\n\nLine 3\n\n";
    const expected = "Line 1\n\nLine 2\n\nLine 3\n";
    const result = cleanWhitespace(input);
    assert.strictEqual(result, expected);
});

// 2. getFirstSearchResult Direct URL Bypass Tests
runTest("getFirstSearchResult - Direct URL Bypass with https", async () => {
    const url = "https://tabs.ultimate-guitar.com/tab/coldplay/yellow-chords-12345";
    const result = await getFirstSearchResult(url);
    assert.strictEqual(result, url);
});

runTest("getFirstSearchResult - Direct URL Bypass without protocol", async () => {
    const url = "tabs.ultimate-guitar.com/tab/coldplay/yellow-chords-12345";
    const expected = "https://tabs.ultimate-guitar.com/tab/coldplay/yellow-chords-12345";
    const result = await getFirstSearchResult(url);
    assert.strictEqual(result, expected);
});

console.log("\n✨ ALL NEW FEATURE TESTS PASSED SUCCESSFULLY!");
