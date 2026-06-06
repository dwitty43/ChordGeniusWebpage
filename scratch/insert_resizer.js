const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '../public/index.html');
const rehearseHtmlPath = path.join(__dirname, '../public/rehearse.html');

const resizerMarkup = '\n        <div class="resize-gutter" id="workspaceResizer"></div>\n';

const resizerJsCode = `
// ── DRAGGABLE PANEL RESIZER ──
(function() {
    const resizer = document.getElementById('workspaceResizer');
    const panelLeft = document.querySelector('.panel-left');
    const workspaceBody = document.querySelector('.workspace-body');
    if (!resizer || !panelLeft || !workspaceBody) return;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('cg_panel_left_width');
    if (savedWidth && window.innerWidth > 1024) {
        panelLeft.style.width = savedWidth + 'px';
    }

    let startX = 0;
    let startWidth = 0;
    let isDragging = false;

    function startDrag(e) {
        if (window.innerWidth <= 1024) return; // Disable dragging on mobile stacked layout
        isDragging = true;
        startX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        startWidth = parseInt(document.defaultView.getComputedStyle(panelLeft).width, 10);
        
        resizer.classList.add('dragging');
        workspaceBody.classList.add('resizing-active');
        document.body.style.cursor = 'col-resize';
        
        // Add listeners for move and end on document
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', endDrag);
    }

    function onDrag(e) {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault(); // Prevent standard touch scroll during drag
        
        const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const deltaX = clientX - startX;
        let newWidth = startWidth + deltaX;

        // Strict bounds constraint: 300px min for left, 350px min for right panel
        // Workspace sidebar (Pane 1) is 240px wide on desktop
        const maxLeftWidth = window.innerWidth - 350 - 240; 
        if (newWidth < 300) newWidth = 300;
        if (newWidth > maxLeftWidth) newWidth = maxLeftWidth;

        panelLeft.style.width = newWidth + 'px';
        localStorage.setItem('cg_panel_left_width', newWidth);
    }

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        resizer.classList.remove('dragging');
        workspaceBody.classList.remove('resizing-active');
        document.body.style.cursor = '';
        
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', endDrag);
    }

    resizer.addEventListener('mousedown', startDrag);
    resizer.addEventListener('touchstart', startDrag, { passive: true });
})();
`;

// 1. Process index.html
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Insert resizer markup between LEFT PANEL and RIGHT PANEL
const indexSplitToken = '        <!-- RIGHT PANEL: LIVE STAGE VIEW -->';
if (!indexHtml.includes(indexSplitToken)) {
    console.error("Could not find RIGHT PANEL split token in index.html!");
    process.exit(1);
}

indexHtml = indexHtml.replace(indexSplitToken, resizerMarkup + '\n' + indexSplitToken);
console.log("Successfully inserted resizer markup into index.html!");

// Insert JS script right before the closing </script> tag
const scriptClosingTag = '</script>';
const scriptClosingIndex = indexHtml.lastIndexOf(scriptClosingTag);
if (scriptClosingIndex === -1) {
    console.error("Could not find closing script tag in index.html!");
    process.exit(1);
}

indexHtml = indexHtml.substring(0, scriptClosingIndex) + resizerJsCode + indexHtml.substring(scriptClosingIndex);
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log("Successfully wrote index.html!");

// 2. Process rehearse.html
let rehearseHtml = fs.readFileSync(rehearseHtmlPath, 'utf8');

const rehearseSplitToken = '        <!-- RIGHT PANEL: STAGE VIEW (Pane 3) -->';
if (!rehearseHtml.includes(rehearseSplitToken)) {
    console.error("Could not find RIGHT PANEL split token in rehearse.html!");
    process.exit(1);
}

rehearseHtml = rehearseHtml.replace(rehearseSplitToken, resizerMarkup + '\n' + rehearseSplitToken);
console.log("Successfully inserted resizer markup into rehearse.html!");

// Fix the duplicate urlParams redeclaration SyntaxError
const duplicateUrlParams = '// Try parsing from URL parameters first\nconst urlParams = new URLSearchParams(window.location.search);';
const fixUrlParams = '// Try parsing from URL parameters first (urlParams is already declared on line 435)';
if (rehearseHtml.includes(duplicateUrlParams)) {
    rehearseHtml = rehearseHtml.replace(duplicateUrlParams, fixUrlParams);
    console.log("Successfully fixed duplicate urlParams in rehearse.html!");
} else {
    // Also try checking for CRLF line endings
    const duplicateUrlParamsCRLF = '// Try parsing from URL parameters first\r\nconst urlParams = new URLSearchParams(window.location.search);';
    if (rehearseHtml.includes(duplicateUrlParamsCRLF)) {
        rehearseHtml = rehearseHtml.replace(duplicateUrlParamsCRLF, fixUrlParams);
        console.log("Successfully fixed duplicate urlParams (CRLF style) in rehearse.html!");
    } else {
        console.warn("Could not find duplicate urlParams in rehearse.html!");
    }
}

const scriptClosingIndexRehearse = rehearseHtml.lastIndexOf(scriptClosingTag);
if (scriptClosingIndexRehearse === -1) {
    console.error("Could not find closing script tag in rehearse.html!");
    process.exit(1);
}

rehearseHtml = rehearseHtml.substring(0, scriptClosingIndexRehearse) + resizerJsCode + rehearseHtml.substring(scriptClosingIndexRehearse);
fs.writeFileSync(rehearseHtmlPath, rehearseHtml, 'utf8');
console.log("Successfully wrote rehearse.html!");

