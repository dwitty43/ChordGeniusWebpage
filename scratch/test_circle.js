const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flats  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function getNoteIndex(note) {
    let cleanNote = note;
    if (cleanNote === 'B#') cleanNote = 'C';
    if (cleanNote === 'E#') cleanNote = 'F';
    if (cleanNote === 'Cb') cleanNote = 'B';
    if (cleanNote === 'Fb') cleanNote = 'E';

    let index = sharps.indexOf(cleanNote);
    if (index === -1) index = flats.indexOf(cleanNote);
    return index;
}

function getKeyCircleCoordinate(keyString) {
    if (!keyString) return null;
    const cleanKey = keyString.trim();
    const match = cleanKey.match(/^([A-G][#b]?)(m|min|minor|maj|major)?$/i);
    if (!match) return null;
    let root = match[1];
    let rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return null;
    
    const isMinor = /m|min|minor/i.test(match[2] || '');
    if (isMinor) {
        rootIndex = (rootIndex + 3) % 12;
    }
    
    return (rootIndex * 7) % 12;
}

function getCircleOfFifthsDistance(key1, key2) {
    const c1 = getKeyCircleCoordinate(key1);
    const c2 = getKeyCircleCoordinate(key2);
    if (c1 === null || c2 === null) return null;
    const diff = Math.abs(c1 - c2);
    return Math.min(diff, 12 - diff);
}

function getTranspositionRemedies(key1, key2) {
    const c1 = getKeyCircleCoordinate(key1);
    if (c1 === null) return [];
    
    const match2 = key2.trim().match(/^([A-G][#b]?)(m|min|minor|maj|major)?$/i);
    if (!match2) return [];
    const root2 = match2[1];
    const quality2 = match2[2] || '';
    const isMinor2 = /m|min|minor/i.test(quality2);
    const rootIndex2 = getNoteIndex(root2);
    if (rootIndex2 === -1) return [];
    
    const candidates = [];
    
    for (let i = 0; i < 12; i++) {
        const isFlatKey = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'].includes(sharps[i]);
        const candRoot = isFlatKey ? flats[i] : sharps[i];
        const candKey = candRoot + (isMinor2 ? 'm' : '');
        
        const cCand = getKeyCircleCoordinate(candKey);
        if (cCand === null) continue;
        
        const diffCircle = Math.abs(c1 - cCand);
        const distCircle = Math.min(diffCircle, 12 - diffCircle);
        
        if (distCircle >= 3) continue;
        
        let semitoneShift = (i - rootIndex2 + 12) % 12;
        if (semitoneShift > 6) semitoneShift -= 12;
        
        if (semitoneShift === 0) continue;
        
        candidates.push({
            key: candKey,
            semitoneShift: semitoneShift,
            circleDistance: distCircle
        });
    }
    
    candidates.sort((a, b) => Math.abs(a.semitoneShift) - Math.abs(b.semitoneShift));
    return candidates;
}

// Validation tests
const testKeys = ['C', 'Am', 'G', 'Em', 'D', 'Bm', 'F', 'Dm', 'E', 'C#m', 'Eb', 'Cm'];
console.log("=== Coordinate Mapping Validation ===");
testKeys.forEach(k => {
    console.log(`Key: ${k.padEnd(5)} -> Coordinate: ${getKeyCircleCoordinate(k)}`);
});

console.log("\n=== Distance Math Validation ===");
const pairs = [
    ['C', 'G', 1],
    ['C', 'Am', 0],
    ['C', 'F', 1],
    ['C', 'E', 4],
    ['C', 'Eb', 3],
    ['Am', 'Em', 1],
    ['G', 'Em', 0],
    ['F#m', 'C', 6]
];
pairs.forEach(([k1, k2, expected]) => {
    const dist = getCircleOfFifthsDistance(k1, k2);
    console.log(`Dist between ${k1.padEnd(3)} and ${k2.padEnd(3)}: ${dist} (Expected: ${expected})`);
});

console.log("\n=== Remedies Validation (C to E) ===");
const remedies = getTranspositionRemedies('C', 'E');
remedies.forEach(r => {
    console.log(`Recommended alternative: Sound in ${r.key.padEnd(4)} (Shift: ${r.semitoneShift > 0 ? '+' : ''}${r.semitoneShift} semitones, Circle Dist: ${r.circleDistance})`);
});
