const fs = require('fs');
const path = require('path');

function checkJsSyntax(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let index = 1;
    while ((match = scriptRegex.exec(content)) !== null) {
        const js = match[1];
        if (js.trim() === '') continue;
        try {
            // Check syntax by creating a Function
            new Function(js);
            console.log(`Script block ${index} in ${path.basename(filePath)}: Syntactically valid.`);
        } catch (err) {
            console.error(`ERROR: Syntax error in script block ${index} of ${path.basename(filePath)}:`);
            console.error(err);
            process.exit(1);
        }
        index++;
    }
}

checkJsSyntax(path.join(__dirname, '../public/index.html'));
checkJsSyntax(path.join(__dirname, '../public/rehearse.html'));
console.log('All script blocks are syntactically valid!');
