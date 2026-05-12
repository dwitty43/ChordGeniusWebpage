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


// --- SEARCH SCRAPER LOGIC ---
async function getFirstSearchResult(query) {
    // Primary: Native Ultimate Guitar Search
    const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`;

    try {
        const html = await fetchUGPage(searchUrl, true);
        const cleanHtml = html.replace(/\\/g, '');

        // Try to find a standard chords tab in the raw HTML/JSON
        const regex = /(https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"'\s>]+-chords-\d+)/i;
        const match = cleanHtml.match(regex);

        if (match && match[1]) return match[1];

        // Fallback 1: Google Search
        console.log("[Engine] Native search failed, trying Google fallback...");
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query)}`;
        const googleHtml = await fetchUGPage(googleUrl, true);
        let $ = cheerio.load(googleHtml);
        let tabUrl = null;

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            // Google sometimes wraps outbound links in a tracking redirect, this unpacks it
            if (href.startsWith('/url?q=')) {
                href = decodeURIComponent(href.split('/url?q=')[1].split('&')[0]);
            }
            if (href.includes('tabs.ultimate-guitar.com/tab/') && href.includes('chords')) {
                tabUrl = href;
                return false; // Break the loop once we find the first valid chart
            }
        });

        if (tabUrl) return tabUrl;

        // Fallback 2: Yahoo Search (Highly reliable for cloud datacenter IPs)
        console.log("[Engine] Google failed, trying Yahoo fallback...");
        const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query)}`;
        const yahooHtml = await fetchUGPage(yahooUrl, true);
        $ = cheerio.load(yahooHtml);

        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            if (href.includes('tabs.ultimate-guitar.com/tab/') && href.includes('chords')) {
                tabUrl = href;
                return false;
            }
        });

        if (tabUrl) return tabUrl;

        throw new Error(`Could not find an Ultimate Guitar chords link for "${query}".`);
    } catch (error) {
        throw new Error(`Search engine failed: ${error.message}`);
    }
}

async function fetchUGPage(url, isSearch = false) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // Allow scripts to run so Cloudflare and React can execute!
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Defeat Cloudflare "Just a moment..."
        let title = await page.title();
        let cfAttempts = 0;
        while ((title.includes("Just a moment") || title.includes("Cloudflare")) && cfAttempts < 8) {
            console.log(`[Scraper] Cloudflare detected. Waiting for clearance (Attempt ${cfAttempts + 1}/8)...`);
            await new Promise(r => setTimeout(r, 2000));
            title = await page.title();
            cfAttempts++;
        }

        if (!isSearch) {
            try { await page.waitForSelector('pre', { timeout: 5000 }); } catch (e) {}
        } else {
            // Give dynamic search engines (UG React or Bing) a moment to render links
            await new Promise(r => setTimeout(r, 1500));
        }

        const html = await page.content();
        await browser.close();
        return html;
    } catch (error) {
        await browser.close();
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
    return /^([a-gA-G1-6]\s*\||\|).*[-]{2,}/.test(trimmed) || /^[-]{4,}/.test(trimmed);
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
function processAndAlignTabs(rawText, originalKey, targetKey, isPdf = false) {
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
                const newChord = transposeChord(chord, originalKey, targetKey);
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

    // THE FIX: Smart Header Logic
    let headerKeyText = `Key: ${targetKey.toUpperCase()}`;
    if (!targetKey || /^nashville$|^1$/i.test(targetKey)) {
        headerKeyText = /^nashville$/i.test(originalKey) ? 'Nashville Numbers' : `Key: ${originalKey.toUpperCase()}`;
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

    // THE FIX: Smart Header Logic
    let headerKeyText = `Key: ${targetKey.toUpperCase()}`;
    if (!targetKey || /^nashville$|^1$/i.test(targetKey)) {
        headerKeyText = /^nashville$/i.test(originalKey) ? 'Nashville Numbers' : `Key: ${originalKey.toUpperCase()}`;
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