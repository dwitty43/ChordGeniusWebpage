const assert = require('assert');
const { 
    getKeyCircleCoordinate, 
    getCircleOfFifthsDistance, 
    getTranspositionRemedies 
} = require('../backend/engine');

console.log("🎸 STARTING CHORD GENIUS CIRCLE OF FIFTHS TEST SUITE\n");

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

// 1. Key Mapping Tests
runTest("Key Mapping (Major and Relative Minor Coordinates)", () => {
    // Major keys mapping
    assert.strictEqual(getKeyCircleCoordinate("C"), 0);
    assert.strictEqual(getKeyCircleCoordinate("G"), 1);
    assert.strictEqual(getKeyCircleCoordinate("D"), 2);
    assert.strictEqual(getKeyCircleCoordinate("A"), 3);
    assert.strictEqual(getKeyCircleCoordinate("E"), 4);
    assert.strictEqual(getKeyCircleCoordinate("B"), 5);
    assert.strictEqual(getKeyCircleCoordinate("F#"), 6);
    assert.strictEqual(getKeyCircleCoordinate("Gb"), 6);
    assert.strictEqual(getKeyCircleCoordinate("Db"), 7);
    assert.strictEqual(getKeyCircleCoordinate("Ab"), 8);
    assert.strictEqual(getKeyCircleCoordinate("Eb"), 9);
    assert.strictEqual(getKeyCircleCoordinate("Bb"), 10);
    assert.strictEqual(getKeyCircleCoordinate("F"), 11);
    
    // Relative Minor keys mapping
    assert.strictEqual(getKeyCircleCoordinate("Am"), 0);   // Relative of C major
    assert.strictEqual(getKeyCircleCoordinate("Em"), 1);   // Relative of G major
    assert.strictEqual(getKeyCircleCoordinate("Bm"), 2);   // Relative of D major
    assert.strictEqual(getKeyCircleCoordinate("F#m"), 3);  // Relative of A major
    assert.strictEqual(getKeyCircleCoordinate("C#m"), 4);  // Relative of E major
    assert.strictEqual(getKeyCircleCoordinate("G#m"), 5);  // Relative of B major
    assert.strictEqual(getKeyCircleCoordinate("D#m"), 6);  // Relative of F# major
    assert.strictEqual(getKeyCircleCoordinate("Ebm"), 6);  // Relative of Gb major
    assert.strictEqual(getKeyCircleCoordinate("Bbm"), 7);  // Relative of Db major
    assert.strictEqual(getKeyCircleCoordinate("Fm"), 8);   // Relative of Ab major
    assert.strictEqual(getKeyCircleCoordinate("Cm"), 9);   // Relative of Eb major
    assert.strictEqual(getKeyCircleCoordinate("Gm"), 10);  // Relative of Bb major
    assert.strictEqual(getKeyCircleCoordinate("Dm"), 11);  // Relative of F major
});

// 2. Circular Step Distance Tests
runTest("Circular Step Distance Calculation", () => {
    // Distance between relative major and minor should be 0
    assert.strictEqual(getCircleOfFifthsDistance("C", "Am"), 0);
    assert.strictEqual(getCircleOfFifthsDistance("G", "Em"), 0);
    
    // Near transitions (1 step)
    assert.strictEqual(getCircleOfFifthsDistance("C", "G"), 1);
    assert.strictEqual(getCircleOfFifthsDistance("C", "F"), 1);
    assert.strictEqual(getCircleOfFifthsDistance("C", "Em"), 1);
    assert.strictEqual(getCircleOfFifthsDistance("Am", "Dm"), 1);
    
    // Moderately far transitions (2 steps)
    assert.strictEqual(getCircleOfFifthsDistance("C", "D"), 2);
    assert.strictEqual(getCircleOfFifthsDistance("C", "Bb"), 2);
    
    // Jarring transitions (>= 3 steps)
    assert.strictEqual(getCircleOfFifthsDistance("C", "E"), 4);
    assert.strictEqual(getCircleOfFifthsDistance("C", "Eb"), 3);
    assert.strictEqual(getCircleOfFifthsDistance("C", "F#"), 6); // Tritone shift (maximum)
});

// 3. Transposition Remedies Tests
runTest("Transposition Remedies Recommendations", () => {
    const remedies = getTranspositionRemedies("C", "E"); // C major to E major (jarring: dist 4)
    
    // Remedies should recommend keys with Circle of Fifths distance < 3
    assert(remedies.length > 0);
    
    // The top recommendation should be the smallest semitone shift (which is F: +1 semitone)
    const firstRemedy = remedies[0];
    assert.strictEqual(firstRemedy.key, "F");
    assert.strictEqual(firstRemedy.semitoneShift, 1);
    assert.strictEqual(firstRemedy.circleDistance, 1);
    
    // The second recommendation should be D (-2 semitones)
    const secondRemedy = remedies[1];
    assert.strictEqual(secondRemedy.key, "D");
    assert.strictEqual(secondRemedy.semitoneShift, -2);
    assert.strictEqual(secondRemedy.circleDistance, 2);
    
    // The remedies should not include E (0 shift) or keys with distance >= 3
    remedies.forEach(r => {
        assert(r.circleDistance < 3);
        assert.notStrictEqual(r.key, "E");
    });
});

console.log("\n✨ ALL TESTS PASSED SUCCESSFULLY! Universal Math Engine is 100% compliant.");
