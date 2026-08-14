const assert = require('assert');
const { 
    estimateKeyFromChords, 
    detectKeyFromTabText, 
    selectBestKey 
} = require('../backend/engine');

console.log("🎸 STARTING CHORD-BASED KEY DETECTION TEST SUITE\n");

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

// 1. Direct chord list estimation tests
runTest("Key Estimation - C Major Progression", () => {
    const chords = ['C', 'F', 'G', 'C'];
    const candidates = estimateKeyFromChords(chords);
    assert.ok(candidates);
    const best = candidates[0];
    assert.strictEqual(best.index, 0); // C
    assert.strictEqual(best.isMinor, false); // Major
});

runTest("Key Estimation - A Minor Progression", () => {
    const chords = ['Am', 'Dm', 'E7', 'Am'];
    const candidates = estimateKeyFromChords(chords);
    assert.ok(candidates);
    const best = candidates[0];
    assert.strictEqual(best.index, 9); // A
    assert.strictEqual(best.isMinor, true); // Minor
});

runTest("Key Estimation - G Major Progression", () => {
    const chords = ['G', 'C', 'D', 'Em', 'G'];
    const candidates = estimateKeyFromChords(chords);
    assert.ok(candidates);
    const best = candidates[0];
    assert.strictEqual(best.index, 7); // G
    assert.strictEqual(best.isMinor, false); // Major
});

// 2. Tab text parsing & key detection tests
runTest("Detect Key from Tab Text - A Minor Song", () => {
    const tabText = `
[Intro]
Am  Dm  F  E

[Verse 1]
Am                    Dm
This is a song in A minor key
F                     E
Let's see if we can detect it
Am                    Dm
It goes on and on in A minor
F                     Am
And ends on A minor chord
    `;
    const candidates = detectKeyFromTabText(tabText);
    assert.ok(candidates);
    
    // Choose best key
    const resolvedKey = selectBestKey(candidates, null);
    assert.strictEqual(resolvedKey, "Am");
});

runTest("Detect Key from Tab Text - G Major Song", () => {
    const tabText = `
[Intro]
G  C  D  Em

[Verse]
G                  C
Here are some lyrics in G Major
D                  Em
A nice simple progression
G                  D
And ending on G
    `;
    const candidates = detectKeyFromTabText(tabText);
    assert.ok(candidates);
    
    // Choose best key with no scraped key
    const best = selectBestKey(candidates, null);
    assert.strictEqual(best, "G");
});

// 3. Scraped key validation & override tests
runTest("Select Best Key - Keep Valid Scraped Key", () => {
    // Chords are Em - C - G - D - G (starts on Em, ends on G)
    const tabText = `
Em  C  D  G
    `;
    const candidates = detectKeyFromTabText(tabText);
    
    // Scraped key is G (correct)
    const result1 = selectBestKey(candidates, "G");
    assert.strictEqual(result1, "G");

    // Scraped key is Em (relative minor, starts on Em, should be within 70% threshold)
    // Let's verify it keeps Em if scraped
    const result2 = selectBestKey(candidates, "Em");
    assert.strictEqual(result2, "Em");
});

runTest("Select Best Key - Override Incorrect Scraped Key", () => {
    // Chords are in G Major
    const tabText = `
G  C  D  Em  G
    `;
    const candidates = detectKeyFromTabText(tabText);
    
    // Scraped key is Eb (completely wrong)
    const result1 = selectBestKey(candidates, "Eb");
    assert.strictEqual(result1, "G"); // Should override to G Major

    // Scraped key is C# (completely wrong)
    const result2 = selectBestKey(candidates, "C#");
    assert.strictEqual(result2, "G"); // Should override to G Major
});

console.log("\n✨ ALL KEY DETECTION TESTS PASSED!");
