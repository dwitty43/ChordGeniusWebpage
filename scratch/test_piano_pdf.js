const fs = require('fs');
const path = require('path');
const { createPdfChart } = require('../backend/engine');

console.log("📄 STARTING PDF PIANO EXPORT TEST...\n");

async function main() {
    try {
        const text = `[Intro]
C  G  Am  F

[Verse 1]
C             G
Here is a test chord sheet
Am            F
With actual chord letters
`;
        
        console.log("Generating PDF with piano voicing...");
        const pdfBuffer = await createPdfChart(text, "Piano Test Song", "C", "C", "120", 0, "4/4", "1", "piano");
        
        const outputPath = path.join(__dirname, 'test_piano.pdf');
        fs.writeFileSync(outputPath, pdfBuffer);
        console.log(`✅ PDF generated successfully and saved to: ${outputPath}`);
        
        process.exit(0);
    } catch (e) {
        console.error("❌ PDF Generation Failed:");
        console.error(e);
        process.exit(1);
    }
}

main();
