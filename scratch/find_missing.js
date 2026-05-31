const fs = require('fs');
const path = require('path');

const repoPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage';

const origIndex = fs.readFileSync(path.join(__dirname, 'orig_index.css'), 'utf8');
const origRehearse = fs.readFileSync(path.join(__dirname, 'orig_rehearse.css'), 'utf8');
const origLogin = fs.readFileSync(path.join(__dirname, 'orig_login.css'), 'utf8');
const origPremium = fs.readFileSync(path.join(__dirname, 'orig_premium.css'), 'utf8');

const newStyles = fs.readFileSync(path.join(repoPath, 'public', 'styles.css'), 'utf8');

// Stateful CSS parser that handles nested blocks correctly
function parseCSS(css) {
    const rules = [];
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    
    let depth = 0;
    let currentSelector = '';
    let currentBlock = '';
    
    for (let i = 0; i < noComments.length; i++) {
        const char = noComments[i];
        if (char === '{') {
            depth++;
            if (depth === 1) {
                // start of outer rule
            } else {
                currentBlock += char;
            }
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                const selector = currentSelector.trim();
                const block = currentBlock.trim();
                if (selector && block) {
                    rules.push({ selector, block });
                }
                currentSelector = '';
                currentBlock = '';
            } else {
                currentBlock += char;
            }
        } else {
            if (depth === 0) {
                currentSelector += char;
            } else {
                currentBlock += char;
            }
        }
    }
    return rules;
}

const origIndexRules = parseCSS(origIndex);
const origRehearseRules = parseCSS(origRehearse);
const origLoginRules = parseCSS(origLogin);
const origPremiumRules = parseCSS(origPremium);
const newRules = parseCSS(newStyles);

const newRulesMap = {};
newRules.forEach(r => {
    const normalizedSel = r.selector.replace(/\s+/g, ' ').trim();
    if (!newRulesMap[normalizedSel]) {
        newRulesMap[normalizedSel] = [];
    }
    newRulesMap[normalizedSel].push(r.block.replace(/\s+/g, ' ').trim());
});

console.log('--- Missing Rules from index.html (637fb2b) ---');
origIndexRules.forEach(r => {
    const normalizedSel = r.selector.replace(/\s+/g, ' ').trim();
    const normalizedBlock = r.block.replace(/\s+/g, ' ').trim();
    
    // Check if selector exists in styles.css
    const newBlocks = newRulesMap[normalizedSel];
    if (!newBlocks) {
        console.log(`Missing Selector: "${r.selector}"`);
        console.log(`Block:\n${r.block}\n`);
    } else {
        // Selector exists, check if block matches
        const blockMatch = newBlocks.some(b => b === normalizedBlock);
        if (!blockMatch) {
            console.log(`Different Block for Selector: "${r.selector}"`);
            console.log(`Original block:\n${r.block}`);
            console.log(`New blocks in styles.css:\n${newBlocks.join('\n--- or ---\n')}\n`);
        }
    }
});

console.log('--- Missing Rules from rehearse.html (637fb2b) ---');
origRehearseRules.forEach(r => {
    const normalizedSel = r.selector.replace(/\s+/g, ' ').trim();
    const normalizedBlock = r.block.replace(/\s+/g, ' ').trim();
    
    // Check if selector exists in styles.css
    const newBlocks = newRulesMap[normalizedSel];
    if (!newBlocks) {
        // Exclude specific overrides/styles if they are intentionally replaced
        console.log(`Missing Selector: "${r.selector}"`);
        console.log(`Block:\n${r.block}\n`);
    } else {
        const blockMatch = newBlocks.some(b => b === normalizedBlock);
        if (!blockMatch) {
            console.log(`Different Block for Selector: "${r.selector}"`);
            console.log(`Original block:\n${r.block}`);
            console.log(`New blocks in styles.css:\n${newBlocks.join('\n--- or ---\n')}\n`);
        }
    }
});
