const fs = require('fs');
const pdf = require('pdf-parse');
const { processAndAlignTabs } = require('../backend/engine.js');

async function run() {
    const dataBuffer = fs.readFileSync("C:\\Users\\Dwitt\\Downloads\\Late_Night_talking_Chart (1).pdf");
    const data = await pdf(dataBuffer);

    console.log("=== TRANSLATED & TRANSPOSED OUTPUT ===");
    // processAndAlignTabs(rawText, originalKey, targetKey, isPdf = false, simplify = false, capo = 0)
    const result = processAndAlignTabs(data.text, 'nashville', 'C', true, false, 2);
    console.log(result);
}

run();
