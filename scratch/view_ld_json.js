const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'echords_yellow.html'), 'utf-8');
const $ = cheerio.load(html);

console.log("JSON-LD scripts:");
$('script[type="application/ld+json"]').each((i, el) => {
    console.log(i, $(el).text());
});
