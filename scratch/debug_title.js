const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const html = fs.readFileSync(path.join(__dirname, 'ug_runaway.html'), 'utf-8');
const $ = cheerio.load(html);

console.log('Script tags containing UGAPP:');
$('script').each((i, el) => {
    const text = $(el).text();
    if (text.includes('UGAPP')) {
        console.log(i, 'Length:', text.length);
        console.log(text.slice(0, 500));
    }
});

console.log('\nChecking if there is any other JSON in script tags:');
$('script[type="application/ld+json"]').each((i, el) => {
    console.log(i, $(el).text());
});
