const fs = require('fs');
const path = require('path');

const repoPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage';

const origIndex = fs.readFileSync(path.join(__dirname, 'orig_index.css'), 'utf8');
const origRehearse = fs.readFileSync(path.join(__dirname, 'orig_rehearse.css'), 'utf8');
const origLogin = fs.readFileSync(path.join(__dirname, 'orig_login.css'), 'utf8');
const origPremium = fs.readFileSync(path.join(__dirname, 'orig_premium.css'), 'utf8');

const newStyles = fs.readFileSync(path.join(repoPath, 'public', 'styles.css'), 'utf8');

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
                // start
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

const missingFromIndex = [];
const mismatchedFromIndex = [];

origIndexRules.forEach(r => {
    const normalizedSel = r.selector.replace(/\s+/g, ' ').trim();
    const normalizedBlock = r.block.replace(/\s+/g, ' ').trim();
    const newBlocks = newRulesMap[normalizedSel];
    
    if (!newBlocks) {
        missingFromIndex.push(r);
    } else {
        const blockMatch = newBlocks.some(b => b === normalizedBlock);
        if (!blockMatch) {
            mismatchedFromIndex.push({ orig: r, newBlocks });
        }
    }
});

const missingFromRehearse = [];
origRehearseRules.forEach(r => {
    const normalizedSel = r.selector.replace(/\s+/g, ' ').trim();
    const normalizedBlock = r.block.replace(/\s+/g, ' ').trim();
    const newBlocks = newRulesMap[normalizedSel];
    
    if (!newBlocks) {
        missingFromRehearse.push(r);
    }
});

console.log('=== SUMMARY OF COMPLETELY MISSING SELECTORS ===');
console.log(`Total completely missing from index.html: ${missingFromIndex.length}`);
missingFromIndex.forEach((r, i) => {
    console.log(`${i+1}. "${r.selector}"`);
});

console.log(`\nTotal completely missing from rehearse.html: ${missingFromRehearse.length}`);
missingFromRehearse.forEach((r, i) => {
    console.log(`${i+1}. "${r.selector}"`);
});
