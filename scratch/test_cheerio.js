const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const htmlPath = path.join(__dirname, 'ug_runaway.html');
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('HTML loaded. Length:', html.length);

const $ = cheerio.load(html);
const preTags = $('pre');
console.log('Number of <pre> tags found by Cheerio:', preTags.length);

if (preTags.length > 0) {
    console.log('First <pre> text sample:', preTags.first().text().slice(0, 100));
} else {
    console.log('Could not find any <pre> tags using Cheerio.');
    
    // Try custom regex
    const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (match) {
        console.log('Regex found <pre> content length:', match[1].length);
        console.log('Regex found <pre> text sample:', match[1].slice(0, 100));
    } else {
        console.log('Regex also failed to find <pre> tag.');
    }
}
