const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'echords_yellow.html'), 'utf-8');
const $ = cheerio.load(html);

const preTag = $('pre').first();
console.log("Pre Tag Text Length:", preTag.text().length);
console.log("Pre Tag HTML snippet:\n", preTag.html().slice(0, 1000));
console.log("\nPlain Text snippet:\n", preTag.text().slice(0, 500));
