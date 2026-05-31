const fs = require('fs');
const path = require('path');

const repoPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage';

const origIndex = fs.readFileSync(path.join(__dirname, 'orig_index.css'), 'utf8');
const origRehearse = fs.readFileSync(path.join(__dirname, 'orig_rehearse.css'), 'utf8');
const origLogin = fs.readFileSync(path.join(__dirname, 'orig_login.css'), 'utf8');
const origPremium = fs.readFileSync(path.join(__dirname, 'orig_premium.css'), 'utf8');

const newStyles = fs.readFileSync(path.join(repoPath, 'public', 'styles.css'), 'utf8');

// A simple function to parse CSS rules into a map of selector -> block
function parseCSS(css) {
    const rules = {};
    // Strip comments
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Regexp to match rule blocks: selector { block }
    // Handles nested blocks up to 1 level (e.g. @media or data-theme selectors)
    // To keep it simple and robust, let's find all outer matches, and also handle @media blocks
    // Or we can just use a simple stateful parser to extract blocks correctly
    
    let depth = 0;
    let currentSelector = '';
    let currentBlock = '';
    let inRule = false;
    
    for (let i = 0; i < noComments.length; i++) {
        const char = noComments[i];
        if (char === '{') {
            depth++;
            if (depth === 1) {
                inRule = true;
            } else {
                currentBlock += char;
            }
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                inRule = false;
                const selector = currentSelector.trim();
                const block = currentBlock.trim();
                if (selector && block) {
                    if (!rules[selector]) {
                        rules[selector] = [];
                    }
                    rules[selector].push(block);
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

console.log('Total rules in orig index:', Object.keys(origIndexRules).length);
console.log('Total rules in orig rehearse:', Object.keys(origRehearseRules).length);
console.log('Total rules in orig login:', Object.keys(origLoginRules).length);
console.log('Total rules in orig premium:', Object.keys(origPremiumRules).length);
console.log('Total rules in new styles.css:', Object.keys(newRules).length);

// Let's check for missing console-box:
console.log('\n--- Checking console-box rules:');
const cbSelectors = ['.console-box', '.console-box:hover'];
cbSelectors.forEach(sel => {
    console.log(`Original index has ${sel}:`, !!origIndexRules[sel]);
    console.log(`New styles has ${sel}:`, !!newRules[sel]);
});

// Let's find selector mismatches or check button/input properties
console.log('\n--- Checking buttons, inputs, selects, textareas properties:');
const testSelectors = [
    'button', 'select', 'input', 'input[type="range"]',
    '.nav-btn', '.nav-btn:hover', '.nav-btn.active',
    '.sig-btn', '.sig-btn:hover', '.sig-btn.active',
    '.adj-btn', '.adj-btn:hover', '.adj-btn:active',
    '#playBtn', '#playBtn:hover', '#playBtn.playing',
    '#tapBtn', '#tapBtn:hover', '#tapBtn:active',
    '.kf-btn', '.kf-btn:hover',
    '.checkout-btn', '.checkout-btn:hover',
    '.auth-submit-btn', '.auth-submit-btn:hover',
    '.kf-textarea', '.kf-textarea:focus', '.kf-textarea:hover'
];

function normalize(str) {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

testSelectors.forEach(sel => {
    // Find all occurrences in original files
    const origOccurrences = [];
    if (origIndexRules[sel]) origOccurrences.push({ file: 'orig_index', blocks: origIndexRules[sel] });
    if (origRehearseRules[sel]) origOccurrences.push({ file: 'orig_rehearse', blocks: origRehearseRules[sel] });
    if (origLoginRules[sel]) origOccurrences.push({ file: 'orig_login', blocks: origLoginRules[sel] });
    if (origPremiumRules[sel]) origOccurrences.push({ file: 'orig_premium', blocks: origPremiumRules[sel] });
    
    const newOccurrences = newRules[sel] || [];
    
    if (origOccurrences.length === 0) {
        console.log(`Selector "${sel}" was not in any original file.`);
        return;
    }
    
    console.log(`\nSelector: "${sel}"`);
    console.log(`- Original occurrences: ${origOccurrences.map(o => o.file).join(', ')}`);
    console.log(`- New occurrences in styles.css: ${newOccurrences.length > 0 ? 'Yes' : 'No'}`);
    
    origOccurrences.forEach(orig => {
        orig.blocks.forEach((origBlock, idx) => {
            // Find a match in new blocks
            const match = newOccurrences.find(newBlock => normalize(newBlock) === normalize(origBlock));
            if (match) {
                console.log(`  [Match] from ${orig.file} (occurrence ${idx + 1}) matches styles.css perfectly!`);
            } else {
                console.log(`  [Mismatch/Changed] from ${orig.file} (occurrence ${idx + 1}):`);
                console.log(`    Original: "${origBlock}"`);
                const bestNew = newOccurrences[0] || 'NONE';
                console.log(`    New (best candidate): "${bestNew}"`);
            }
        });
    });
});
