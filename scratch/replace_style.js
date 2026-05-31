const fs = require('fs');
const path = require('path');
const rehearsePath = path.join(__dirname, '../public/rehearse.html');
let html = fs.readFileSync(rehearsePath, 'utf8');

// Find the style tags, using regex to handle potential formatting variations
const styleRegex = /[\t ]*<style>[\s\S]*?<\/style>/i;
if (!styleRegex.test(html)) {
    console.error('Could not find style tag block in rehearse.html');
    process.exit(1);
}

html = html.replace(styleRegex, '    <link rel="stylesheet" href="styles.css">');
fs.writeFileSync(rehearsePath, html, 'utf8');
console.log('Successfully replaced style block in rehearse.html!');
