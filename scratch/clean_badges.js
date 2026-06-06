const fs = require('fs');
const path = require('path');

const files = [
    path.join(__dirname, '../public/rehearse.html'),
    path.join(__dirname, '../public/premium.html'),
    path.join(__dirname, '../public/login.html')
];

const targetPattern = /<span class="badge" style="background: linear-gradient\(135deg, #f59e0b, #d97706\); color: #080a10; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-left: 4px; vertical-align: middle;">Studio<\/span>/g;
const replacement = '<span class="badge">Studio</span>';

files.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.match(targetPattern)) {
            content = content.replace(targetPattern, replacement);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Successfully cleaned brand badge in ${path.basename(filePath)}!`);
        } else {
            console.warn(`Pattern not matched or already clean in ${path.basename(filePath)}`);
        }
    } else {
        console.error(`File not found: ${filePath}`);
    }
});
