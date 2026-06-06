const assert = require('assert');
const { getChordSvg } = require('../backend/engine');

console.log("🎹 STARTING CHORD GENIUS PIANO VOICINGS TEST SUITE\n");

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

// 1. Piano Voicings Parsing & SVG Output Tests for actual chord letters
runTest("Piano Voicings SVG Output for C Major", () => {
    const svg = getChordSvg("C", "piano");
    assert(svg);
    assert(svg.includes('class="piano-svg"'));
    assert(svg.includes('class="piano-white-key"'));
    assert(svg.includes('class="piano-black-key"'));
    // Should have circles
    const circlesCount = (svg.match(/<circle/g) || []).length;
    assert(circlesCount > 0);
});

runTest("Piano Voicings SVG Output for A Minor (Am)", () => {
    const svg = getChordSvg("Am", "piano");
    assert(svg);
    // Should have circles for A, C, E
    assert(svg.includes('<circle'));
});

runTest("Piano Voicings SVG Output for F Major 7 (Fmaj7)", () => {
    const svg = getChordSvg("Fmaj7", "piano");
    assert(svg);
    // F (5), A (9), C (0), E (4)
    assert(svg.includes('<circle'));
});

runTest("Piano Voicings SVG Output for Slash/Bass Chords (C/E)", () => {
    const svg = getChordSvg("C/E", "piano");
    assert(svg);
    assert(svg.includes('<circle'));
});

console.log("\n✨ ALL PIANO VOICING TESTS PASSED SUCCESSFULLY!");
