const fs = require('fs');
const path = require('path');

const stylesPath = 'c:\\Users\\Dwitt\\Projects\\ChordGeniusWebpage\\public\\styles.css';
let css = fs.readFileSync(stylesPath, 'utf8');

// Self-healing: Strip previously inserted blocks if they exist
css = css.replace(/\/\* ── BUTTON AND INPUT STYLING \(TOUCHED UP FROM ORIGINAL 637fb2b\) ── \*\/[\s\S]*?\/\* ── END OF BUTTON AND INPUT STYLING ── \*\//gi, '');
css = css.replace(/\/\* ── LIGHT MODE OVERRIDES FOR BUTTONS & INPUTS ── \*\/[\s\S]*?\/\* ── END OF LIGHT MODE OVERRIDES ── \*\//gi, '');
css = css.replace(/\/\* ── CONVERT WORKSTATION DASHBOARD & PANE STYLES ── \*\/[\s\S]*?\/\* ── END OF CONVERT WORKSTATION DASHBOARD ── \*\//gi, '');
css = css.replace(/\/\* ── ADDED MEDIA QUERY ADDITIONS ── \*\/[\s\S]*?\/\* ── END OF ADDED MEDIA QUERY ADDITIONS ── \*\//gi, '');

const formStyles = `/* ── BUTTON AND INPUT STYLING (TOUCHED UP FROM ORIGINAL 637fb2b) ── */
        button {
            width: 100%; padding: 12px 14px; font-size: 13.5px; font-weight: 700;
            color: white; border: none; border-radius: 10px; cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
            display: flex; justify-content: center; align-items: center;
            gap: 6px; font-family: 'Inter', inherit;
        }
        button:disabled {
            background: var(--border) !important; color: var(--text-muted) !important; cursor: not-allowed; box-shadow: none !important; transform: none !important; border-color: transparent !important;
        }
        button:active:not(:disabled) {
            transform: translateY(1px) !important; box-shadow: none !important;
        }
        input[type="text"], input[type="number"], input[type="file"], select {
            width: 100%; padding: 13px 16px; font-size: 14px;
            border: 1px solid var(--border); border-radius: 10px; outline: none;
            background-color: var(--input-bg); color: var(--text-main);
            transition: border-color 0.2s, box-shadow 0.2s;
            font-family: 'Inter', inherit;
        }
        input[type="text"]:focus, input[type="number"]:focus, select:focus {
            border-color: var(--primary); box-shadow: 0 0 0 3px var(--focus-ring);
        }
        input[type="text"]::placeholder {
            color: var(--text-muted); opacity: 0.55;
        }
        select optgroup {
            font-weight: 700; color: var(--text-muted);
        }
        select option {
            font-weight: 500; color: var(--text-main); background: var(--card-bg);
        }
        .file-wrapper {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        input[type="file"] {
            padding: 12px 16px; border: 2px dashed var(--border); cursor: pointer; height: auto;
            width: 100%; box-sizing: border-box; display: block;
        }
        input[type="file"]::file-selector-button {
            margin-right: 12px; padding: 5px 12px; border: 1px solid var(--border);
            border-radius: 6px; background: var(--card-bg); color: var(--text-muted);
            font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 12.5px;
        }
        input[type="file"]::file-selector-button:hover {
            border-color: var(--primary); color: var(--primary);
        }
        input[type="file"]:focus {
            border-color: var(--upload); box-shadow: 0 0 0 3px rgba(232,121,42,0.18);
        }
        .helper-text-container {
            position: relative; width: 100%; margin-top: 2px;
        }
        .helper-text {
            font-size: 11.5px; color: var(--text-muted); white-space: normal; line-height: 1.4;
        }
        .warning-text {
            color: #a07820; margin-top: 4px;
        }
        [data-theme="light"] .warning-text {
            color: #8a5e10;
        }
        /* ── END OF BUTTON AND INPUT STYLING ── */`;

const lightModeOverrides = `/* ── LIGHT MODE OVERRIDES FOR BUTTONS & INPUTS ── */
        [data-theme="light"] input[type="text"]:hover,
        [data-theme="light"] select:hover {
            border-color: hsla(38, 90%, 42%, 0.4);
            background-color: #ffffff;
            transform: translateY(-0.5px);
        }
        [data-theme="light"] input[type="text"]:focus,
        [data-theme="light"] select:focus {
            border-color: var(--primary);
            background-color: #ffffff;
            box-shadow: 0 0 0 3.5px var(--focus-ring);
            transform: translateY(0);
        }
        [data-theme="light"] button {
            transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        [data-theme="light"] #searchBtn:hover:not(:disabled),
        [data-theme="light"] #uploadBtn:hover:not(:disabled),
        [data-theme="light"] #downloadBinderBtn:hover:not(:disabled) {
            transform: translateY(-1.5px);
            box-shadow: 0 6px 16px hsla(38, 90%, 42%, 0.2);
        }
        [data-theme="light"] .previewBtn:hover:not(:disabled) {
            background-color: hsl(30, 15%, 96%);
            border-color: var(--primary);
            color: var(--primary);
            transform: translateY(-1.5px);
            box-shadow: 0 4px 12px hsla(38, 90%, 42%, 0.08);
        }
        [data-theme="light"] .downloadBtn:hover:not(:disabled) {
            transform: translateY(-1.5px);
            box-shadow: 0 6px 16px rgba(16, 185, 129, 0.2);
        }
        [data-theme="light"] .previewBtn     { background: var(--card-bg); }
        [data-theme="light"] .modal-close    { background: var(--card-bg); }
        [data-theme="light"] .modal-footer   { background: var(--card-bg); }
        [data-theme="light"] .toggle-slider {
            background: hsla(30, 10%, 50%, 0.15);
            transition: background 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), border-color 0.3s;
        }
        [data-theme="light"] .toggle-slider::before {
            background: #ffffff;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        [data-theme="light"] .toggle-switch input:checked + .toggle-slider {
            background: var(--primary);
        }
        [data-theme="light"] .toggle-label:hover .toggle-slider {
            background: hsla(30, 10%, 50%, 0.25);
            border-color: hsla(38, 90%, 42%, 0.3);
        }
        [data-theme="light"] .toggle-label:hover .toggle-switch input:checked + .toggle-slider {
            background: var(--primary-hover);
        }
        /* ── END OF LIGHT MODE OVERRIDES ── */`;

const convertAndHistoryStyles = `/* ── CONVERT WORKSTATION DASHBOARD & PANE STYLES ── */
        .app-card {
            background-color: var(--card-bg);
            width: 100%; max-width: 840px;
            border-radius: 24px;
            box-shadow: var(--shadow-main);
            border: 1px solid var(--card-border);
            animation: fadeInUp 0.5s ease-out;
            position: relative; overflow: hidden;
        }
        .app-card::before {
            content: '';
            position: absolute; top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, transparent 0%, #f59e0b 25%, #fbbf24 50%, #e8792a 75%, transparent 100%);
        }
        .hero {
            padding: 40px 52px 32px;
            position: relative;
            border-bottom: 1px solid var(--border);
        }
        .hero::after {
            content: '';
            position: absolute; right: -20px; top: 0; bottom: 0; width: 280px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 120'%3E%3Cpolyline points='0,60 20,30 35,80 50,15 65,90 80,40 95,70 110,20 125,85 140,35 155,75 170,25 185,80 200,45 215,65 230,30 245,70 260,50 280,60' fill='none' stroke='%23f59e0b' stroke-width='1.5' stroke-opacity='0.07'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: center; background-size: contain;
            pointer-events: none;
        }
        .top-bar {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 24px;
        }
        .brand { display: flex; align-items: center; gap: 16px; }
        .brand-text h1 {
            margin: 0;
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 28px; font-weight: 800; letter-spacing: -0.01em; line-height: 1;
            background: linear-gradient(135deg, #f5d060 0%, #f59e0b 45%, #e8792a 100%);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
            display: flex; align-items: center; gap: 8px;
        }
        .brand-tagline {
            font-size: 12px; color: var(--text-muted); margin-top: 5px;
            font-style: italic; letter-spacing: 0.02em;
        }
        .eq-bars {
            display: flex; align-items: flex-end; gap: 3px; height: 22px; margin-left: 4px;
        }
        .eq-bar {
            width: 3px; border-radius: 2px;
            background: linear-gradient(to top, #f59e0b, #fbbf24);
            animation: eq 1.4s ease-in-out infinite;
            opacity: 0.7;
        }
        .eq-bar:nth-child(1) { animation-duration: 1.1s; animation-delay: 0s; }
        .eq-bar:nth-child(2) { animation-duration: 1.4s; animation-delay: 0.18s; }
        .eq-bar:nth-child(3) { animation-duration: 0.9s; animation-delay: 0.06s; }
        .eq-bar:nth-child(4) { animation-duration: 1.2s; animation-delay: 0.28s; }
        .eq-bar:nth-child(5) { animation-duration: 1.0s; animation-delay: 0.12s; }

        .controls-row { display: flex; align-items: center; gap: 10px; }
        .nav-tabs {
            display: flex; gap: 3px;
            background: var(--input-bg); border: 1px solid var(--border);
            border-radius: 10px; padding: 3px;
        }
        .nav-tab {
            padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 700;
            cursor: pointer; text-decoration: none; color: var(--text-muted);
            transition: all 0.2s; border: none; background: none; font-family: 'Inter', inherit;
        }
        .nav-tab:hover { color: var(--text-main); }
        .nav-tab.active {
            background: linear-gradient(135deg, #f59e0b, #e8792a);
            color: #0c0800; box-shadow: 0 2px 8px rgba(245,158,11,0.35);
        }
        .feature-strip {
            display: flex; gap: 10px; flex-wrap: wrap;
        }
        .feature-chip {
            display: flex; align-items: center; gap: 7px;
            padding: 7px 14px;
            background: var(--panel-bg); border: 1px solid var(--border);
            border-radius: 24px; font-size: 12.5px; font-weight: 600;
            color: var(--text-muted); transition: all 0.2s;
        }
        .feature-chip svg { color: var(--primary); flex-shrink: 0; }
        .feature-chip:hover { border-color: var(--primary); color: var(--text-main); }
        .grid-inputs {
            display: grid; grid-template-columns: repeat(5, 1fr);
            gap: 12px; margin-bottom: 24px;
        }
        .grid-inputs > input[type="text"],
        .grid-inputs > .file-wrapper {
            grid-column: 1 / -1;
        }
        .grid-buttons {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 10px; margin-bottom: 12px;
        }
        #searchBtn { background: linear-gradient(135deg, #f59e0b, #d97706); color: #09060a; font-weight: 800; }
        #searchBtn:hover:not(:disabled) { background: linear-gradient(135deg, #fbbf24, #f59e0b); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(245,158,11,0.35); }
        #uploadBtn { background: linear-gradient(135deg, #f59e0b, #d97706); color: #09060a; font-weight: 800; }
        #uploadBtn:hover:not(:disabled) { background: linear-gradient(135deg, #fbbf24, #f59e0b); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(245,158,11,0.35); }
        .downloadBtn { background: linear-gradient(135deg, #10b981, #059669); }
        .downloadBtn:hover:not(:disabled) { background: linear-gradient(135deg, #34d399, #10b981); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(16,185,129,0.3); }
        .previewBtn { background: var(--input-bg); border: 1px solid var(--border); color: var(--text-muted); }
        .toggle-row { margin-bottom: 22px; padding-left: 2px; }
        .divider {
            display: flex; align-items: center; text-align: center;
            margin: 40px 0; color: var(--text-muted); font-size: 11px;
            font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; gap: 16px;
        }
        .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid var(--border); }
        .divider-icon { color: var(--primary); opacity: 0.5; font-size: 15px; }

        /* ── CONSOLE-BOX ── */
        .console-box {
            background: var(--panel-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .console-box:hover {
            border-color: var(--primary-glow);
        }

        /* ── HISTORY / SETLIST ── */
        .history-section { margin-top: 14px; }
        .history-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 10px;
        }
        .history-label {
            font-size: 10.5px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.14em; color: var(--text-muted);
            display: flex; align-items: center; gap: 8px;
        }
        .history-clear {
            font-size: 11px; color: var(--text-muted); cursor: pointer;
            text-decoration: none; transition: color 0.2s; background: none;
            border: none; padding: 0; font-family: inherit; width: auto;
        }
        .history-clear:hover { color: #ef4444; }
        .history-list { display: flex; flex-direction: column; gap: 6px; }
        .history-item {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px;
            background: var(--panel-bg); border: 1px solid var(--border);
            border-radius: 10px; cursor: pointer;
            transition: all 0.2s; position: relative; overflow: hidden;
        }
        .history-item::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
            background: linear-gradient(to bottom, #f59e0b, #e8792a);
            opacity: 0; transition: opacity 0.2s;
        }
        .history-item:hover { border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.04); }
        .history-item:hover::before { opacity: 1; }
        .history-play {
            width: 28px; height: 28px; border-radius: 50%;
            background: var(--border); display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; transition: background 0.2s;
            color: var(--text-muted);
        }
        .history-item:hover .history-play { background: var(--primary); color: #09060a; }
        .history-info { flex: 1; min-width: 0; }
        .history-name {
            font-size: 13.5px; font-weight: 600; color: var(--text-main);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .history-meta { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
        .history-badges { display: flex; gap: 5px; flex-shrink: 0; }
        .history-badge {
            font-size: 10px; font-weight: 700; padding: 2px 7px;
            border-radius: 4px; border: 1px solid var(--border);
            color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;
        }
        .history-badge.format-pdf { border-color: rgba(16,185,129,0.3); color: #10b981; }
        .history-badge.format-docx { border-color: rgba(99,102,241,0.3); color: #818cf8; }
        .history-time { font-size: 10.5px; color: var(--text-muted); flex-shrink: 0; }
        
        [data-theme="light"] .history-item {
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        [data-theme="light"] .history-item:hover {
            border-color: hsla(38, 90%, 42%, 0.3);
            background: #ffffff;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.03);
        }

        /* ── MODALS (Convert Side Workstation) ── */
        .modal-overlay.open .modal {
            transform: none;
        }
        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 24px 32px 16px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            background: var(--panel-bg);
        }
        .modal-title {
            font-family: 'Playfair Display', serif;
            font-size: 22px;
            font-weight: 700;
            color: var(--primary);
        }
        .modal-subtitle {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }
        .modal-close {
            display: none !important; /* Hide close button as it is a permanent side panel */
        }
        .modal-body {
            flex: 1;
            overflow: auto;
            background: var(--input-bg);
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            height: 100%;
        }
        .modal-body iframe { width: 100%; height: 100%; min-height: 480px; border: none; display: block; }
        .modal-docx-preview {
            padding: 44px 52px; font-family: 'Courier New', Courier, monospace;
            font-size: 13.5px; line-height: 1.7; color: #111; background: #fff; white-space: pre-wrap;
        }
        .modal-loading {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: var(--card-bg); gap: 14px;
        }
        .spinner {
            width: 36px; height: 36px; border-radius: 50%;
            border: 3px solid var(--border); border-top-color: var(--primary);
            animation: spin 0.75s linear infinite;
        }
        .modal-footer {
            padding: 18px 32px;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            flex-shrink: 0;
            background: var(--panel-bg);
        }
        .modal-footer button { width: auto; padding: 9px 20px; font-size: 13px; }

        /* ── WORKSPACE RIGHT-EXPANDED CONTROLS ── */
        .workspace-body.right-expanded .panel-left {
            width: 460px;
            max-width: 460px;
            flex-shrink: 0;
        }
        .workspace-body.right-expanded .panel-right {
            flex: 1;
            width: auto;
        }
        .workstation-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 48px;
            height: 100%;
            color: var(--text-muted);
            animation: fadeIn 0.4s ease-out;
        }
        .workstation-placeholder .placeholder-icon {
            font-size: 64px;
            margin-bottom: 24px;
            opacity: 0.85;
            animation: floating 3s ease-in-out infinite;
        }
        .workstation-placeholder h3 {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 24px;
            color: var(--text-main);
            margin: 0 0 12px;
        }
        .workstation-placeholder p {
            max-width: 400px;
            line-height: 1.6;
            margin: 0;
            font-size: 14px;
        }
        #previewOverlay.open + #noActiveSongPlaceholder {
            display: none !important;
        }
        #interactivePreview b.chord-hoverable {
            color: #e8792a;
            cursor: pointer;
            border-bottom: 1px dashed transparent;
            transition: color 0.15s ease, border-color 0.15s ease;
        }
        #interactivePreview b.chord-hoverable:hover {
            color: #f59e0b;
            border-bottom-color: #f59e0b;
        }
        #interactivePreview .line {
            line-height: 1.4;
            min-height: 1.4em;
        }
        #interactivePreview .line.header {
            font-weight: bold;
            color: var(--primary);
            margin-top: 10px;
        }
        .gold-glow {
            color: #080a10 !important;
            background: linear-gradient(135deg, #f59e0b, #d97706) !important;
            border-color: #f59e0b !important;
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.6) !important;
            animation: premiumGlow 2s infinite alternate;
            font-weight: 600;
        }

        /* ── ANIMATIONS ── */
        @keyframes floating {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        @keyframes premiumGlow {
            0% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.4); }
            100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.8); }
        }
        @keyframes eq {
            0%, 100% { height: 4px; opacity: 0.4; }
            50% { height: 20px; opacity: 0.9; }
        }
        @keyframes fadeInUp {
            from { opacity:0; transform:translateY(28px); }
            to { opacity:1; transform:translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        /* ── END OF CONVERT WORKSTATION DASHBOARD ── */`;

const innerMediaQueryAddition = `/* ── ADDED MEDIA QUERY ADDITIONS ── */
            #previewOverlay {
                position: relative !important;
                height: 600px !important;
            }
            .workstation-placeholder {
                padding: 60px 24px;
            }
            /* ── END OF ADDED MEDIA QUERY ADDITIONS ── */`;

// 1. Insert form styles after resets: "transition:\s*background-color\s*0\.4s,\s*color\s*0\.4s;\s*\}\s*"
css = css.replace(/(transition:\s*background-color\s*0\.4s,\s*color\s*0\.4s;\s*\r?\n\s*})/i, "$1\n\n        " + formStyles);

// 2. Insert light mode overrides before resets: "\*,\s*\*::before,\s*\*::after\s*\{"
css = css.replace(/(\*,\s*\*::before,\s*\*::after\s*\{)/i, lightModeOverrides + "\n\n        $1");

// 3. Insert convert and history styles before media queries: "@media\s*\(\s*max-width\s*:\s*1024px\s*\)"
css = css.replace(/(@media\s*\(\s*max-width\s*:\s*1024px\s*\))/i, convertAndHistoryStyles + "\n\n        $1");

// 4. Insert media query additions inside media query: "#rehearsalSheet\s*\{\s*margin:\s*16px\s*!important;\s*height:\s*500px\s*!important;\s*\}"
css = css.replace(/(#rehearsalSheet\s*\{\s*margin:\s*16px\s*!important;\s*height:\s*500px\s*!important;\s*\})/i, "$1\n\n" + innerMediaQueryAddition);

fs.writeFileSync(stylesPath, css);
console.log('Robustly merged all styles successfully with clean self-healing!');
