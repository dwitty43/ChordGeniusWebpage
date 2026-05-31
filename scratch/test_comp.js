const fs = require('fs');
const path = require('path');

const stylesPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage\\public\\styles.css';
const css = fs.readFileSync(stylesPath, 'utf8');

const selectors = [
    'button',
    'button:disabled',
    'button:active:not(:disabled)',
    'input[type="text"], input[type="number"], input[type="file"], select',
    'input[type="text"]:focus, input[type="number"]:focus, select:focus',
    'input[type="text"]::placeholder',
    'select optgroup',
    'select option',
    '.file-wrapper',
    'input[type="file"]',
    'input[type="file"]::file-selector-button',
    'input[type="file"]::file-selector-button:hover',
    'input[type="file"]:focus',
    '.helper-text-container',
    '.helper-text',
    '.warning-text',
    '[data-theme="light"] .warning-text',
    '.toggle-row',
    '.previewBtn:hover:not(:disabled)',
    '[data-theme="light"] .toggle-slider',
    '[data-theme="light"] .toggle-slider::before',
    '[data-theme="light"] .toggle-label:hover .toggle-switch input:checked + .toggle-slider',
    '.brand-icon'
];

selectors.forEach(sel => {
    // Escape special chars for regex
    const escaped = sel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
    const regex = new RegExp(escaped, 'i');
    console.log(`Selector "${sel}" exists in styles.css:`, regex.test(css));
});
