const fs = require('fs');
const path = require('path');

const filePath = "C:\\Users\\Dwitt\\.gemini\\antigravity\\brain\\66559154-8a2a-41c1-8f29-bc519421ae55\\.system_generated\\worktrees\\subagent-Rehearsal-Autoscroll-Developer-self-2efab916\\public\\index.html";
console.log('Target file path:', filePath);

let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// 1. Replace the modal-footer to include the Take to Rehearsal button
const oldFooter = `<div class="modal-footer">
            <button class="previewBtn" id="addSetlistBtn" style="background: var(--primary-glow); color: var(--primary); border-color: var(--primary);">+ Add to Setlist</button>
            <button class="downloadBtn" id="modalDownloadBtn">Download Current</button>
        </div>`;

const newFooter = `<div class="modal-footer">
            <button class="previewBtn" id="addSetlistBtn" style="background: var(--primary-glow); color: var(--primary); border-color: var(--primary);">+ Add to Setlist</button>
            <button class="previewBtn" id="takeToRehearsalBtn" style="background: #10b9811c; color: #10b981; border-color: #10b98150;">🚀 Take to Rehearsal</button>
            <button class="downloadBtn" id="modalDownloadBtn">Download Current</button>
        </div>`;

if (!content.includes(oldFooter)) {
    console.error('Could not find oldFooter in index.html');
    process.exit(1);
}

content = content.replace(oldFooter, newFooter);
console.log('Successfully replaced modal footer!');

// 2. Add the click handler after addSetlistBtn's listener
const oldListener = `    if (typeof renderSetlist === 'function') renderSetlist();
    closePreview();
    showStatus(\`\${window.currentChartData.title} added to Setlist! (\${setlistQueue.length} charts ready)\`, 'success');
});`;

const newListener = `    if (typeof renderSetlist === 'function') renderSetlist();
    closePreview();
    showStatus(\`\${window.currentChartData.title} added to Setlist! (\${setlistQueue.length} charts ready)\`, 'success');
});

// Take to Rehearsal
document.getElementById('takeToRehearsalBtn').addEventListener('click', () => {
    if (!window.currentChartData) return;
    const text = document.getElementById('liveEditor').value;
    const bpmVal = document.getElementById('songBpm').value || document.getElementById('uploadBpm').value || window.currentChartData.bpm || '';
    const timeSigVal = document.getElementById('songTimeSignature').value || document.getElementById('uploadTimeSignature').value || window.currentChartData.timeSignature || '';
    
    let target = window.currentChartData.targetKey || 'C';
    let original = window.currentChartData.originalKey || '';
    let capo = parseInt(window.currentChartData.capo, 10) || 0;
    let playKey = window.currentChartData.playKey || '';
    
    let keyText = target;
    if (original && original !== target) {
        keyText += \` (Original: \${original})\`;
    }
    if (capo > 0) {
        keyText += \` | Capo: \${capo}\`;
        if (playKey) {
            keyText += \` (Play: \${playKey})\`;
        }
    }

    const song = {
        title: window.currentChartData.title,
        keyText: keyText,
        text: text,
        bpm: bpmVal,
        capo: capo.toString(),
        timeSignature: timeSigVal
    };

    localStorage.setItem('cg_rehearse_song', JSON.stringify(song));
    
    if (bpmVal) {
        localStorage.setItem('cg_last_bpm', bpmVal);
    }
    if (timeSigVal) {
        localStorage.setItem('cg_last_beats', timeSigVal);
    }

    let href = '/rehearse.html';
    const params = [];
    if (bpmVal) params.push(\`bpm=\${bpmVal}\`);
    if (timeSigVal) params.push(\`beats=\${timeSigVal}\`);
    if (params.length > 0) {
        href += '?' + params.join('&');
    }
    window.location.href = href;
});`;

if (!content.includes(oldListener)) {
    console.error('Could not find oldListener in index.html');
    process.exit(1);
}

content = content.replace(oldListener, newListener);
console.log('Successfully added Take to Rehearsal click handler!');

fs.writeFileSync(filePath, content, 'utf8');
console.log('index.html written successfully!');
