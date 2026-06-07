const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'echords_yellow.html'), 'utf-8');
const $ = cheerio.load(html);

console.log("Searching for key...");
$('*').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('key') && text.length < 200) {
        console.log(i, el.name, "Class:", $(el).attr('class'), "Text:", text);
    }
});

// Also search in scripts
$('script').each((i, el) => {
    const text = $(el).text();
    if (text.includes('key') || text.includes('tom')) {
        const match = text.match(/key|tom/i);
        if (match) {
            console.log("Script index:", i, "Length:", text.length);
            // Print a small slice around the match
            const idx = text.indexOf(match[0]);
            console.log(text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + 150)));
        }
    }
});
