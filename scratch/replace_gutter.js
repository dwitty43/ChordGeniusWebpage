const fs = require('fs');
const path = require('path');

const stylesPath = path.join(__dirname, '../public/styles.css');
let css = fs.readFileSync(stylesPath, 'utf8');

// Normalize CRLF to LF for reliable regex matching, then we will write back
const originalEnded = css.includes('\r\n');
let normalizedCss = css.replace(/\r\n/g, '\n');

// 1. Replace the default .panel-left rules
const oldPanelLeftRegex = /\.panel-left\s*\{\s*flex:\s*1;\s*max-width:\s*400px;\s*width:\s*400px;\s*border-right:\s*1px\s*solid\s*var\(--border\);\s*background:\s*var\(--bg\);\s*display:\s*flex;\s*flex-direction:\s*column;\s*height:\s*100%;\s*flex-shrink:\s*0;\s*transition:\s*all\s*0\.3s\s*cubic-bezier\(0\.25,\s*0\.8,\s*0\.25,\s*1\);\s*\}/g;

const newPanelLeftCss = `.panel-left {
            width: 400px;
            border-right: 1px solid var(--border);
            background: var(--bg);
            display: flex;
            flex-direction: column;
            height: 100%;
            flex-shrink: 0;
            transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        .workspace-body.resizing-active .panel-left,
        .workspace-body.resizing-active .panel-right {
            transition: none !important;
        }

        /* ── DRAGGABLE GUTTER DIVIDER ── */
        .resize-gutter {
            width: 8px;
            margin: 0 -4px;
            cursor: col-resize;
            background: transparent;
            z-index: 100;
            position: relative;
            flex-shrink: 0;
            transition: background 0.15s ease;
            user-select: none;
            -webkit-user-select: none;
        }
        .resize-gutter::after {
            content: '';
            position: absolute;
            left: 3px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: transparent;
            transition: background 0.15s ease;
        }
        .resize-gutter:hover::after,
        .resize-gutter.dragging::after {
            background: var(--primary);
            box-shadow: 0 0 8px var(--primary-glow);
        }
        @media (max-width: 1024px) {
            .resize-gutter {
                display: none !important;
            }
        }`;

if (!oldPanelLeftRegex.test(normalizedCss)) {
    console.error("Could not find standard .panel-left rules in styles.css!");
    process.exit(1);
}

normalizedCss = normalizedCss.replace(oldPanelLeftRegex, newPanelLeftCss);
console.log("Successfully replaced .panel-left rules!");

// 2. Replace the expanded panel-left max-width constraint
const oldExpandedPanelRegex = /\.workspace-body\.right-expanded\s+\.panel-left\s*\{\s*width:\s*460px;\s*max-width:\s*460px;\s*flex-shrink:\s*0;\s*\}/g;
const newExpandedPanelCss = `.workspace-body.right-expanded .panel-left {
            width: 460px;
            flex-shrink: 0;
        }`;

if (!oldExpandedPanelRegex.test(normalizedCss)) {
    console.warn("Could not find standard expanded .panel-left rules, attempting loose match...");
} else {
    normalizedCss = normalizedCss.replace(oldExpandedPanelRegex, newExpandedPanelCss);
    console.log("Successfully replaced expanded panel rules!");
}

// Convert back to original line endings if needed
if (originalEnded) {
    normalizedCss = normalizedCss.replace(/\n/g, '\r\n');
}

fs.writeFileSync(stylesPath, normalizedCss, 'utf8');
console.log("Successfully wrote updated styles.css!");
