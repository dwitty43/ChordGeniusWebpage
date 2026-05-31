const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage';

// 1. Get original styles from index.html at commit 637fb2b
const indexHtml = execSync('git show 637fb2b:public/index.html', { cwd: repoPath, encoding: 'utf8' });
const indexStylesMatch = indexHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const indexStyles = indexStylesMatch ? indexStylesMatch[1] : '';

// 2. Get original styles from rehearse.html at commit 637fb2b
const rehearseHtml = execSync('git show 637fb2b:public/rehearse.html', { cwd: repoPath, encoding: 'utf8' });
const rehearseStylesMatch = rehearseHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const rehearseStyles = rehearseStylesMatch ? rehearseStylesMatch[1] : '';

// 3. Get original styles from login.html at commit 637fb2b
let loginStyles = '';
try {
    const loginHtml = execSync('git show 637fb2b:public/login.html', { cwd: repoPath, encoding: 'utf8' });
    const loginStylesMatch = loginHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    loginStyles = loginStylesMatch ? loginStylesMatch[1] : '';
} catch (e) {
    console.log('No login.html in commit 637fb2b or failed to read');
}

// 4. Get original styles from premium.html at commit 637fb2b
let premiumStyles = '';
try {
    const premiumHtml = execSync('git show 637fb2b:public/premium.html', { cwd: repoPath, encoding: 'utf8' });
    const premiumStylesMatch = premiumHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    premiumStyles = premiumStylesMatch ? premiumStylesMatch[1] : '';
} catch (e) {
    console.log('No premium.html in commit 637fb2b or failed to read');
}

// Let's write these to temp files
fs.writeFileSync(path.join(__dirname, 'orig_index.css'), indexStyles);
fs.writeFileSync(path.join(__dirname, 'orig_rehearse.css'), rehearseStyles);
fs.writeFileSync(path.join(__dirname, 'orig_login.css'), loginStyles);
fs.writeFileSync(path.join(__dirname, 'orig_premium.css'), premiumStyles);

console.log('Extracted all original styles successfully!');
