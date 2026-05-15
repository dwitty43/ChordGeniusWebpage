#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const cheerio = require('cheerio');
const { Document, Packer, Paragraph, TextRun } = require('docx');

// --- THE UNIVERSAL MATH ENGINE ---

const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flats  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const intervals = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

// Map Nashville inputs back to half-step distances
const nashvilleToHalfSteps = { 
    '1':0, '#1':1, 'b2':1, '2':2, '#2':3, 'b3':3, '3':4, 
    '4':5, '#4':6, 'b5':6, '5':7, '#5':8, 'b6':8, '6':9, '#6':10, 'b7':10, '7':11 
};

function getNoteIndex(note) {
    let cleanNote = note;
    if (cleanNote === 'B#') cleanNote = 'C';
    if (cleanNote === 'E#') cleanNote = 'F';
    if (cleanNote === 'Cb') cleanNote = 'B';
    if (cleanNote === 'Fb') cleanNote = 'E';

    let index = sharps.indexOf(cleanNote);
    if (index === -1) index = flats.indexOf(cleanNote);
    return index;
}

function getPreferredAccidentals(key) {
    // Keys that naturally use flats instead of sharps
    const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'];
    return flatKeys.includes(key) ? flats : sharps;
}

function parseChord(chordString) {
    const parts = chordString.split('/'); 
    return parts.map(part => {
        // FIX: Nashville checked first, explicitly case-sensitive to protect "B" vs "b"
        const match = part.match(/^([b#]?[1-7]|[A-Ga-g][#b]?)(.*)$/);
        if (match) return { root: match[1], extension: match[2] };
        return null;
    });
}

function transposeChord(chordString, originalKey, targetKey) {
    if (/^[|()\[\]{}:\-~,]+$/.test(chordString)) return chordString;

    const match = chordString.match(/^(\(?)(.*?)(\)?)$/);
    const prefix = match[1] || '';
    const rawChord = match[2];
    const suffix = match[3] || '';

    if (/^N\.?C\.?$/i.test(rawChord)) return prefix + rawChord + suffix;

    // Determine target format
    const isTargetNashville = !targetKey || /^nashville$|^1$/i.test(targetKey.trim());
    const targetScale = isTargetNashville ? null : getPreferredAccidentals(targetKey.trim());
    const targetKeyIndex = isTargetNashville ? 0 : getNoteIndex(targetKey.trim());

    const parsedParts = parseChord(rawChord);
    
    const convertedParts = parsedParts.map(part => {
        if (!part) return '';
        
        let distance = 0;
        const isSourceNashville = /^[b#]?[1-7]$/.test(part.root);

        if (isSourceNashville) {
            distance = nashvilleToHalfSteps[part.root.toLowerCase()];
            if (distance === undefined) return part.root + part.extension;
        } else {
            const noteIndex = getNoteIndex(part.root);
            const origKeyIndex = getNoteIndex(originalKey.trim().replace(/m|min|minor$/i, ''));
            if (noteIndex === -1 || origKeyIndex === -1) return part.root + part.extension; 
            distance = (noteIndex - origKeyIndex + 12) % 12;
        }

        let newRoot = '';
        if (isTargetNashville) {
            newRoot = intervals[distance];
        } else {
            const outIndex = (targetKeyIndex + distance) % 12;
            newRoot = targetScale[outIndex];
        }
        
        return newRoot + part.extension;
    });

    return prefix + convertedParts.join('/') + suffix; 
}


// --- CHORD SIMPLIFIER ---
function simplifyChord(chordStr) {
    const wrap = chordStr.match(/^(\(?)(.+?)(\)?)$/);
    if (!wrap) return chordStr;
    const [, open, inner, close] = wrap;

    // Strip bass note
    const noBass = inner.replace(/\/([A-Ga-g][#b]?|[b#]?[1-7])/, '');

    // Match root + basic quality only (keep m/dim/aug, drop everything else)
    const m = noBass.match(/^([b#]?[1-7]|[A-Ga-g][#b]?)(m(?:in)?|maj|dim|aug|\+|°|ø)?/i);
    if (!m) return chordStr;

    let quality = m[2] || '';
    if (/^min$/i.test(quality)) quality = 'm';
    if (/^maj$/i.test(quality)) quality = '';
    if (quality === '°') quality = 'dim';
    if (quality === 'ø') quality = 'm';

    return open + m[1] + quality + close;
}

// --- SEARCH SCRAPER LOGIC ---

async function getFirstSearchResult(query) {
    let tabUrl = null;

    // We removed Native UG Search completely. It is heavily protected by Turnstile
    // and causes the API to timeout before it can try the fallbacks.

    // Primary: DuckDuckGo HTML (Highly reliable, no JS captchas)
    try {
        console.log("[Engine] Searching via DuckDuckGo...");
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query)}`;
        const ddgHtml = await fetchUGPage(ddgUrl, true);
        const $ = cheerio.load(ddgHtml);

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            
            // DDG routes links through a redirector, this unpacks it
            if (href.includes('uddg=')) {
                href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
            }
            
            if (href.includes('tabs.ultimate-guitar.com/tab/') && href.includes('chords')) {
                tabUrl = href;
                return false; 
            }
        });

        if (tabUrl) return tabUrl;
    } catch (e) {
        console.log(`[Engine] DuckDuckGo failed: ${e.message}`);
    }

    // Fallback: Yahoo Search (Very datacenter-friendly)
    try {
        console.log("[Engine] Trying Yahoo fallback...");
        const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query)}`;
        const yahooHtml = await fetchUGPage(yahooUrl, true);
        const $ = cheerio.load(yahooHtml);

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            
            if (href.includes('tabs.ultimate-guitar.com/tab/') && href.includes('chords')) {
                tabUrl = href;
                return false;
            }
        });

        if (tabUrl) return tabUrl;
    } catch (e) {
        console.log(`[Engine] Yahoo failed: ${e.message}`);
    }

    throw new Error(`Could not find an Ultimate Guitar chords link for "${query}".`);
}

async function fetchUGPage(url, isSearch = false) {
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' 
        ] 
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
        // Fast load: Removed the massive 30-second loop to prevent API timeouts.
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if (!isSearch) {
            // The Stealth Plugin will handle the background check naturally.
            // waitForSelector automatically waits across redirects if Cloudflare clears us.
            try { await page.waitForSelector('pre', { timeout: 8000 }); } catch (e) {}
        } else {
            // Give search engine DOMs a brief moment to paint their anchor tags
            await new Promise(r => setTimeout(r, 1000));
        }

        const html = await page.content();
        await browser.close();
        return html;
    } catch (error) {
        if (browser) await browser.close();
        throw new Error(`Puppeteer failed: ${error.message}`);
    }
}

function extractTabData(html) {
    if (html.includes("Just a moment...") || html.includes("cf-browser-verification")) {
        throw new Error("Cloudflare intercepted the browser.");
    }
    const $ = cheerio.load(html);
    let songKey = null;
    $('span').each((i, el) => {
        if ($(el).text().trim() === 'Key:') songKey = $(el).next('span').text().trim();
    });

    const preTag = $('pre').first();
    if (!preTag || preTag.length === 0) throw new Error("Could not find the <pre> tag containing the chords.");
    
    return { rawTabText: preTag.text(), songKey };
}

// --- HEURISTICS ---
function isChordLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    const tokens = trimmed.split(/\s+/);
    const chordCharRegex = /^([|()\[\]{}:\-~,]+|\(?([A-G][#b]?(m|min|maj|M|dim|aug|sus|add|o|\+|-|\d|[#b])*(?:\/[A-G][#b]?)?\*?|N\.?C\.?)\)?)$/i;
    return tokens.every(token => chordCharRegex.test(token));
}

function isNashvilleLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    const tokens = trimmed.split(/\s+/);
    const nashvilleRegex = /^([|()\[\]{}:\-~,]+|\(?([b#]?[1-7](m|min|maj|M|dim|aug|sus|add|o|\+|-|\d|[#b])*(?:\/[b#]?[1-7])?\*?|N\.?C\.?)\)?)$/i;
    return tokens.every(token => nashvilleRegex.test(token));
}

function isTabLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;

    // 1. Traditional tabs with pipes (e.g., e|--- or |---)
    if (/^([a-gA-G1-6]\s*\||\|).*[-]{2,}/.test(trimmed)) return true;
    
    // 2. Heavy dash lines (e.g., --------)
    if (/^[-]{4,}/.test(trimmed)) return true;
    
    // 3. THE FIX: Letter followed immediately by dashes/numbers (e.g., G-11-11-11)
    if (/^[a-gA-G1-6]?\s*[-]+[\d-]+/.test(trimmed)) return true;
    
    // 4. THE FIX: Wrapped number/dash lines (e.g., 3-13-13- or -9-9-9-1)
    if (/^[\d-]{5,}$/.test(trimmed)) return true;

    return false;
}

function isNoiseLine(line) {
    const trimmed = line.trim();
    if (/https?:\/\//i.test(trimmed)) return true;
    if (/(?:^|\s)[xX0-9]{6}(?:\s|$)/.test(trimmed)) return true;
    if (/^\*+$/.test(trimmed)) return true;
    if (/^\|\s*[a-zA-Z]\s+/.test(trimmed)) return true;
    if (/^\[.*Chords\]$/i.test(trimmed)) return true;
    if (/^[1-4\s&a]+$/.test(trimmed) && trimmed.includes('&')) return true;
    return false;
}

// --- TEXT PROCESSING ---
function processAndAlignTabs(rawText, originalKey, targetKey, isPdf = false, simplify = false) {
    const lines = rawText.split('\n');
    let processedLines = [];
    let hasStarted = false; 

    for (let line of lines) {
        const trimmed = line.trim();

        if (!hasStarted && /^\[?(Intro|Verse|Chorus|Pre-Chorus|Bridge|Outro|Solo|Instrumental)[^\]]*\]?$/i.test(trimmed)) hasStarted = true;
        if (!hasStarted) continue;
        if (isTabLine(line) || isNoiseLine(line)) continue; 

        if (trimmed === '') {
            const lastPushed = processedLines[processedLines.length - 1];
            if (lastPushed === undefined || lastPushed.trim() === '') continue; 
        }

        if (isChordLine(line) || isNashvilleLine(line)) {
            if (isPdf && processedLines.length > 0) {
                const lastLine = processedLines[processedLines.length - 1].trim();
                const isHeader = /^\[?(Intro|Verse|Chorus|Pre-Chorus|Bridge|Outro|Solo|Instrumental)[^\]]*\]?$/i.test(lastLine);
                if (lastLine != '' && !isHeader) {
                    processedLines.push('');
                }
            }
            let newLine = line.replace(/(\S+)(\s*)/g, (match, chord, spaces) => {
                let newChord = transposeChord(chord, originalKey, targetKey);
                if (simplify && !/^[|()\[\]{}:\-~,]+$/.test(chord) && !/^N\.?C\.?$/i.test(chord.replace(/[()]/g, ''))) {
                    newChord = simplifyChord(newChord);
                }
                const lengthDiff = chord.length - newChord.length;
                let newSpaces = spaces;
                
                if (lengthDiff > 0) {
                    newSpaces += ' '.repeat(lengthDiff);
                } else if (lengthDiff < 0) {
                    const spacesToRemove = Math.min(Math.abs(lengthDiff), newSpaces.length);
                    newSpaces = newSpaces.slice(spacesToRemove);
                }
                return newChord + newSpaces;
            });
            processedLines.push(newLine); 
        } else {
            processedLines.push(line);
        }
    }
    return processedLines.join('\n');
}

// --- DOCUMENT GENERATORS ---
function formatKeyDisplay(keyStr) {
    if (!keyStr) return '';
    return keyStr.charAt(0).toUpperCase() + keyStr.slice(1).toLowerCase();
}
async function createDocxChart(finalChartText, songTitle, originalKey, targetKey) {
    const cleanText = finalChartText.replace(/\x1B\[\d+m/g, ''); 
    const lines = cleanText.split('\n');

    const documentLines = lines.map(line => {
        if (isNashvilleLine(line) || isChordLine(line)) {
            const runs = [];
            const regex = /(\S+)(\s*)/g;
            let match;

            while ((match = regex.exec(line)) !== null) {
                const chord = match[1];
                const spaces = match[2];

                if (/^[|()\[\]{}:\-~,]+$/.test(chord)) {
                    runs.push(new TextRun({ text: chord, font: "Courier New", size: 24, bold: true }));
                    if (spaces) runs.push(new TextRun({ text: spaces, font: "Courier New", size: 24 }));
                    continue;
                }

                const fixMatch = chord.match(/^(\(?)(.*?)(\)?)$/);
                const prefix = fixMatch[1] || '';
                const rawChord = fixMatch[2];
                const suffix = fixMatch[3] || '';

                if (prefix) runs.push(new TextRun({ text: prefix, font: "Courier New", size: 24, bold: true }));

                const chordParts = rawChord.split('/');
                const mainChord = chordParts[0];
                const bassNote = chordParts[1]; 

                const rootMatch = mainChord.match(/^([b#]?[1-7]|[A-Ga-g][b#]?)(.*)$/);

                if (rootMatch) {
                    const root = rootMatch[1];
                    const rawExtension = rootMatch[2];

                    runs.push(new TextRun({ text: root, font: "Courier New", size: 24, bold: true }));

                    if (rawExtension) {
                        const extMatch = rawExtension.match(/^(\D*)(\d.*)?$/);
                        if (extMatch) {
                            if (extMatch[1]) runs.push(new TextRun({ text: extMatch[1], font: "Courier New", size: 24, bold: true }));
                            if (extMatch[2]) runs.push(new TextRun({ text: extMatch[2], font: "Courier New", size: 24, bold: true, superScript: true }));
                        }
                    }
                    if (bassNote) runs.push(new TextRun({ text: `/${bassNote}`, font: "Courier New", size: 24, bold: true }));
                } else {
                    runs.push(new TextRun({ text: rawChord, font: "Courier New", size: 24, bold: true }));
                }

                if (suffix) runs.push(new TextRun({ text: suffix, font: "Courier New", size: 24, bold: true }));
                if (spaces) runs.push(new TextRun({ text: spaces, font: "Courier New", size: 24 }));
            }
            return new Paragraph({ children: runs });
        } else {
            return new Paragraph({ children: [ new TextRun({ text: line, font: "Courier New", size: 24 })] });
        }
    });

    let headerKeyText = `Key: ${formatKeyDisplay(targetKey)}`;
    if (!targetKey || /^nashville$|^1$/i.test(targetKey)) {
        headerKeyText = /^nashville$/i.test(originalKey) ? 'Nashville Numbers' : `Key: ${formatKeyDisplay(originalKey)}`;
    }

    const titleParagraph = new Paragraph({
        children: [ new TextRun({ text: songTitle.toUpperCase(), font: "Courier New", size: 32, bold: true }) ],
        spacing: { after: 200 } 
    });

    const keyParagraph = new Paragraph({
        children: [ new TextRun({ text: headerKeyText, font: "Courier New", size: 24, bold: true }) ],
        spacing: { after: 400 } 
    });

    const doc = new Document({
        sections: [{ properties: {}, children: [titleParagraph, keyParagraph, ...documentLines] }]
    });
    
    return await Packer.toBuffer(doc);
}

async function createPdfChart(finalChartText, songTitle, originalKey, targetKey) {
    const lines = finalChartText.split('\n');
    
    let htmlLines = lines.map(line => {
        if (isNashvilleLine(line) || isChordLine(line)) {
            let htmlLine = '';
            const regex = /(\S+)(\s*)/g;
            let match;
            
            while ((match = regex.exec(line)) !== null) {
                const chord = match[1];
                const spaces = match[2].replace(/ /g, '&nbsp;'); 

                if (/^[|()\[\]{}:\-~,]+$/.test(chord)) {
                    htmlLine += `<b>${chord}</b>${spaces}`;
                    continue;
                }

                const fixMatch = chord.match(/^(\(?)(.*?)(\)?)$/);
                const prefix = fixMatch[1] || '';
                const rawChord = fixMatch[2];
                const suffix = fixMatch[3] || '';

                if (prefix) htmlLine += `<b>${prefix}</b>`;

                const chordParts = rawChord.split('/');
                const mainChord = chordParts[0];
                const bassNote = chordParts[1]; 

                const rootMatch = mainChord.match(/^([b#]?[1-7]|[A-Ga-g][b#]?)(.*)$/);
                if (rootMatch) {
                    htmlLine += `<b>${rootMatch[1]}</b>`;
                    const rawExtension = rootMatch[2];
                    if (rawExtension) {
                        const extMatch = rawExtension.match(/^(\D*)(\d.*)?$/);
                        if (extMatch) {
                            if (extMatch[1]) htmlLine += `<b>${extMatch[1]}</b>`;
                            if (extMatch[2]) htmlLine += `<sup><b>${extMatch[2]}</b></sup>`;
                        }
                    }
                    if (bassNote) htmlLine += `<b>/${bassNote}</b>`;
                } else {
                    htmlLine += `<b>${rawChord}</b>`;
                }

                if (suffix) htmlLine += `<b>${suffix}</b>`;
                htmlLine += spaces;
            }
            return `<div class="line">${htmlLine || '&nbsp;'}</div>`;
        } else {
            return `<div class="line">${line.replace(/ /g, '&nbsp;') || '&nbsp;'}</div>`;
        }
    });

    let headerKeyText = `Key: ${formatKeyDisplay(targetKey)}`;
    if (!targetKey || /^nashville$|^1$/i.test(targetKey)) {
        headerKeyText = /^nashville$/i.test(originalKey) ? 'Nashville Numbers' : `Key: ${formatKeyDisplay(originalKey)}`;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 16px; margin: 40px; color: #000; }
            h1 { font-size: 32px; margin-bottom: 5px; text-transform: uppercase; }
            h2 { font-size: 24px; margin-bottom: 30px; }
            .line { line-height: 1.2; white-space: nowrap; }
            sup { font-size: 75%; }
        </style>
    </head>
    <body>
        <h1>${songTitle}</h1>
        <h2>${headerKeyText}</h2>
        ${htmlLines.join('')}
    </body>
    </html>`;

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    
    const pdfBuffer = await page.pdf({ format: 'Letter', margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }});
    await browser.close();
    return pdfBuffer;
}

module.exports = { getFirstSearchResult, fetchUGPage, extractTabData, processAndAlignTabs, createDocxChart, createPdfChart }