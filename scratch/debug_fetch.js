const { fetchUGPage } = require('../backend/engine');
const fs = require('fs');
const path = require('path');

async function run() {
    const url = 'https://tabs.ultimate-guitar.com/tab/jess-ray/runaway-chords-2596185';
    console.log(`Fetching page: ${url}`);
    try {
        const html = await fetchUGPage(url);
        console.log(`Fetched HTML length: ${html.length}`);
        
        const outputDir = path.join(__dirname, '../scratch');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        const filePath = path.join(outputDir, 'ug_runaway.html');
        fs.writeFileSync(filePath, html, 'utf-8');
        console.log(`Saved html to ${filePath}`);
        
        const hasJsStore = html.includes('js-store');
        const hasUgApp = html.includes('window.UGAPP.store.page');
        const hasPre = html.includes('<pre');
        console.log(`Contains js-store: ${hasJsStore}`);
        console.log(`Contains window.UGAPP: ${hasUgApp}`);
        console.log(`Contains <pre: ${hasPre}`);
        
    } catch (e) {
        console.error('Error fetching:', e.message);
    }
}
run();
