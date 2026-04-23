#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

// --- CHORD CONVERSION LOGIC (The Distance Engine) ---

// Define both sharps and flats so the script can read any tab
const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flats  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map the 12 half-steps to their standard Nashville Number intervals
const intervals = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

function getNoteIndex(note) {
    // Normalize weird enharmonic notes UG authors use (like B# or Fb)
    let cleanNote = note;
    if (cleanNote === 'B#') cleanNote = 'C';
    if (cleanNote === 'E#') cleanNote = 'F';
    if (cleanNote === 'Cb') cleanNote = 'B';
    if (cleanNote === 'Fb') cleanNote = 'E';

    let index = sharps.indexOf(cleanNote);
    if (index === -1) index = flats.indexOf(cleanNote);
    return index;
}

function parseChord(chordString) {
    const parts = chordString.split('/'); 
    const parsed = parts.map(part => {
        const match = part.match(/^([A-G][#b]?)(.*)$/);
        if (match) return { root: match[1], extension: match[2] };
        return null;
    });
    return parsed; 
}

function convertToNashville(chordString, songKey) {
    // 1. If it's just a bar line or pure punctuation, pass it straight through!
    if (/^[|()\[\]{}:\-~,]+$/.test(chordString)) return chordString;

    // 2. Peel off any parentheses hiding the chord
    const match = chordString.match(/^(\(?)(.*?)(\)?)$/);
    const prefix = match[1] || '';
    const rawChord = match[2];
    const suffix = match[3] || '';

    // 3. The Math Engine (now running on 'rawChord')
    if (/^N\.?C\.?$/i.test(rawChord)) {
        return prefix + rawChord + suffix; 
    }

    const cleanKey = songKey.trim().replace(/m|min|minor$/i, '');
    const keyIndex = getNoteIndex(cleanKey);
    if (keyIndex === -1) return chordString; 

    const parsedParts = parseChord(rawChord);
    
    const convertedParts = parsedParts.map(part => {
        if (!part) return '';
        const noteIndex = getNoteIndex(part.root);
        if (noteIndex === -1) return part.root + part.extension; 
        
        const distance = (noteIndex - keyIndex + 12) % 12;
        const number = intervals[distance];
        
        return number + part.extension;
    });

    // 4. Glue the parentheses back onto the converted Nashville Number
    return prefix + convertedParts.join('/') + suffix; 
}

// --- SEARCH SCRAPER LOGIC (Bulletproof DDG Parser) ---
async function getFirstSearchResult(query) {
    const searchString = `site:ultimate-guitar.com ${query} chords`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchString)}`;

    try {
        const html = await fetchUGPage(searchUrl);
        const $ = cheerio.load(html);
        let tabUrl = null;

        // Loop through ALL anchor tags on the page
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return; // Skip if no link

            // 1. Unwrap DDG's redirect tracking
            if (href.includes('uddg=')) {
                try {
                    const prefix = href.startsWith('http') ? '' : 'https:';
                    const parsedUrl = new URL(`${prefix}${href}`);
                    href = decodeURIComponent(parsedUrl.searchParams.get('uddg'));
                } catch (e) { 
                    return; // Skip on parsing error
                }
            }

            // 2. Strict Validation: Is it actually an Ultimate Guitar chords link?
            if (href.includes('tabs.ultimate-guitar.com/tab/') && href.includes('chords')) {
                tabUrl = href;
                return false; // Break the Cheerio loop, we found our target!
            }
        });

        if (!tabUrl) {
            throw new Error(`Could not find an Ultimate Guitar chords link for "${query}".`);
        }

        return tabUrl;

    } catch (error) {
        throw new Error(`Search engine failed: ${error.message}`);
    }
}

// --- BROWSER LAUNCHER ---
async function fetchUGPage(url) {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. RESOURCE BLOCKING: Stop Puppeteer from downloading images, fonts, and heavy CSS
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // We only care about the HTML document and the scripts that load it
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        // 2. THE FAST LOAD: Just wait for the basic DOM to load, not the ads
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // 3. THE SMART WAIT: Wait specifically for the <pre> tag (where the chords live) to appear
        try {
            // Give it up to 5 seconds to render the chords
            await page.waitForSelector('pre', { timeout: 5000 });
        } catch (waitError) {
            // If it times out looking for the <pre> tag, it might be stuck on a Cloudflare challenge.
            // We just let it continue so our extractTabData function can throw the correct Cloudflare error.
        }

        const html = await page.content();
        await browser.close();
        
        return html;
        
    } catch (error) {
        await browser.close();
        throw new Error(`Puppeteer failed: ${error.message}`);
    }
}

// --- DATA EXTRACTOR (Pure Text Version) ---
function extractTabData(html) {
    if (html.includes("Just a moment...") || html.includes("cf-browser-verification")) {
        throw new Error("Cloudflare intercepted the browser.");
    }

    const $ = cheerio.load(html);
    
    // 1. Grab the Key (if they provided one)
    let songKey = null;
    $('span').each((i, el) => {
        if ($(el).text().trim() === 'Key:') {
            songKey = $(el).next('span').text().trim();
        }
    });

    // 2. Grab the pure, unformatted text from the <pre> tag
    const preTag = $('pre').first();
    if (!preTag || preTag.length === 0) {
        throw new Error("Could not find the <pre> tag containing the chords.");
    }
    
    // We use .text() instead of .html() to completely strip all UG tags
    const rawTabText = preTag.text();

    return { rawTabText, songKey };
}

// --- HEURISTICS ---
function isChordLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    const tokens = trimmed.split(/\s+/);
    
    // Added \-~, to explicitly allow dashes, tildes, and commas as spacers
    const chordCharRegex = /^([|()\[\]{}:\-~,]+|\(?([A-G][#b]?(m|min|maj|M|dim|aug|sus|add|o|\+|-|\d|[#b])*(?:\/[A-G][#b]?)?\*?|N\.?C\.?)\)?)$/i;
    
    return tokens.every(token => chordCharRegex.test(token));
}

function isNashvilleLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    const tokens = trimmed.split(/\s+/);
    
    // Added \-~, here as well
    const nashvilleRegex = /^([|()\[\]{}:\-~,]+|\(?([b#]?[1-7](m|min|maj|M|dim|aug|sus|add|o|\+|-|\d|[#b])*(?:\/[b#]?[1-7])?\*?|N\.?C\.?)\)?)$/i;
    
    return tokens.every(token => nashvilleRegex.test(token));
}

function isTabLine(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    
    // Matches standard tab lines like "e|---", "B |-2b3", or just "|---"
    // Also catches lines that are just pure dashes (e.g., "------------")
    const tabRegex = /^([a-gA-G1-6]\s*\||\|).*[-]{2,}/;
    const dashRegex = /^[-]{4,}/;
    
    return tabRegex.test(trimmed) || dashRegex.test(trimmed);
}

function isNoiseLine(line) {
    const trimmed = line.trim();
    if (/https?:\/\//i.test(trimmed)) return true;
    if (/(?:^|\s)[xX0-9]{6}(?:\s|$)/.test(trimmed)) return true;
    if (/^\*+$/.test(trimmed)) return true;
    if (/^\|\s*[a-zA-Z]\s+/.test(trimmed)) return true;
    if (/^\[.*Chords\]$/i.test(trimmed)) return true;
    
    // THE NEW FIX: Skips rhythm counting lines (e.g., "1 & a 2 & a 3 & 4")
    if (/^[1-4\s&a]+$/.test(trimmed) && trimmed.includes('&')) return true;

    return false;
}

// --- TEXT PROCESSING & ALIGNMENT ---
function processAndAlignTabs(rawText, songKey) {
    const lines = rawText.split('\n');
    let processedLines = [];
    
    // The flag that tracks when the actual song begins
    let hasStarted = false; 

    for (let line of lines) {
        const trimmed = line.trim();

        // 1. Check if we've hit a structural marker (e.g., [Intro], [Verse], [Chorus])
        // We make sure the tag doesn't contain the word "Chords" so we ignore chord dictionaries
        if (!hasStarted && /^\[(Intro|Verse|Chorus|Pre-Chorus|Bridge|Outro|Solo|Instrumental)[^\]]*\]$/i.test(trimmed)) {
            hasStarted = true;
        }

        // 2. If the song hasn't started yet, throw the line away!
        if (!hasStarted) continue;

        // 3. --- THE SIFTING FILTERS ---
        if (isTabLine(line) || isNoiseLine(line)) {
            continue; 
        }

        // 4. Whitespace Collapser: Prevent multiple blank lines from piling up
        if (trimmed === '') {
            // If the last line we pushed was also blank, skip this one
            const lastPushed = processedLines[processedLines.length - 1];
            if (lastPushed === undefined || lastPushed.trim() === '') {
                continue; 
            }
        }

        // 5. The Math Engine
        if (isChordLine(line)) {
            let newLine = line.replace(/(\S+)(\s*)/g, (match, chord, spaces) => {
                
                const newChord = convertToNashville(chord, songKey);
                
                const lengthDiff = chord.length - newChord.length;
                let newSpaces = spaces;
                
                if (lengthDiff > 0) {
                    newSpaces += ' '.repeat(lengthDiff);
                } else if (lengthDiff < 0) {
                    const spacesToRemove = Math.min(Math.abs(lengthDiff), newSpaces.length);
                    newSpaces = newSpaces.slice(spacesToRemove);
                }
                
                // NO MORE CHALK! Just return the plain text strings.
                return newChord + newSpaces;
            });
            
            processedLines.push(newLine); 
        } else {
            processedLines.push(line); // It's a lyrics or section line
        }
    }
    
    return processedLines.join('\n');
}

const { Document, Packer, Paragraph, TextRun } = require('docx');

async function createDocxChart(finalChartText, songTitle, songKey) {
    const cleanText = finalChartText.replace(/\x1B\[\d+m/g, ''); 
    const lines = cleanText.split('\n');

    const documentLines = lines.map(line => {
        if (isNashvilleLine(line)) {
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

                if (prefix) {
                    runs.push(new TextRun({ text: prefix, font: "Courier New", size: 24, bold: true }));
                }

                // 1. Isolate the Slash Chord Bass Note first
                const chordParts = chord.split('/');
                const mainChord = chordParts[0];
                const bassNote = chordParts[1]; 

                // 2. Split the Main Chord into Root and Raw Extension
                const rootMatch = mainChord.match(/^([b#]?[1-7])(.*)$/);

                if (rootMatch) {
                    const root = rootMatch[1];
                    const rawExtension = rootMatch[2];

                    // Part A: The Root Note (Bold, Normal Size)
                    runs.push(new TextRun({
                        text: root,
                        font: "Courier New",
                        size: 24,
                        bold: true
                    }));

                    // Part B: The Extension Split (Letters vs Numbers)
                    if (rawExtension) {
                        // This regex grabs all non-digits first (Group 1), 
                        // then the digits and anything after them (Group 2)
                        const extMatch = rawExtension.match(/^(\D*)(\d.*)?$/);

                        if (extMatch) {
                            const extText = extMatch[1];     // e.g., 'm', 'maj', 'sus'
                            const extNumbers = extMatch[2];  // e.g., '7', '9', '7b5'

                            // Print the letters (Bold, Normal Size)
                            if (extText) {
                                runs.push(new TextRun({
                                    text: extText,
                                    font: "Courier New",
                                    size: 24,
                                    bold: true
                                }));
                            }

                            // Print the numbers (Bold, Superscript)
                            if (extNumbers) {
                                runs.push(new TextRun({
                                    text: extNumbers,
                                    font: "Courier New",
                                    size: 24,
                                    bold: true,
                                    superScript: true 
                                }));
                            }
                        }
                    }

                    // Part C: The Bass Note (Bold, Normal Size)
                    if (bassNote) {
                        runs.push(new TextRun({
                            text: `/${bassNote}`,
                            font: "Courier New",
                            size: 24,
                            bold: true
                        }));
                    }

                } else {
                    // Fallback
                    runs.push(new TextRun({
                        text: chord,
                        font: "Courier New",
                        size: 24,
                        bold: true
                    }));
                }

                if (suffix) {
                    runs.push(new TextRun({ text: suffix, font: "Courier New", size: 24, bold: true }));
                }

                // Part D: The Whitespace Padding (Normal size to preserve downbeat math)
                if (spaces) {
                    runs.push(new TextRun({
                        text: spaces,
                        font: "Courier New",
                        size: 24
                    }));
                }
            }

            return new Paragraph({ children: runs });

        } else {
            // It's a lyrics line, print it normally
            return new Paragraph({
                children: [
                    new TextRun({
                        text: line,
                        font: "Courier New",
                        size: 24,
                    })
                ]
            });
        }
    });

    const titleParagraph = new Paragraph({
        children: [
            new TextRun({ 
                text: songTitle.toUpperCase(), 
                font: "Courier New", 
                size: 32, // 16pt font
                bold: true 
            })
        ],
        spacing: { after: 200 } // Adds padding below the title
    });

    const keyParagraph = new Paragraph({
        children: [
            new TextRun({ 
                text: `Original Key: ${songKey}`, 
                font: "Courier New", 
                size: 24, // 12pt font
                bold: true 
            })
        ],
        spacing: { after: 400 } // Adds padding before the chart begins
    });

    // Add the headers to the VERY TOP of the document sections
    const doc = new Document({
        sections: [{
            properties: {},
            children: [titleParagraph, keyParagraph, ...documentLines] 
        }]
    });
    
    // Generate the raw memory buffer and return it directly!
    // No more fs.writeFileSync()
    const buffer = await Packer.toBuffer(doc);
    return buffer;
}

// --- PDF GENERATOR ---
async function createPdfChart(finalChartText, songTitle, songKey) {
    const lines = finalChartText.split('\n');
    
    // 1. Rebuild the chart using HTML so we keep the superscripts and bolding
    let htmlLines = lines.map(line => {
        if (isNashvilleLine(line)) {
            let htmlLine = '';
            const regex = /(\S+)(\s*)/g;
            let match;
            
            while ((match = regex.exec(line)) !== null) {
                const chord = match[1];
                const spaces = match[2].replace(/ /g, '&nbsp;'); // Preserve exact spacing

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

                const rootMatch = mainChord.match(/^([b#]?[1-7])(.*)$/);
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
            // It's a lyrics line
            return `<div class="line">${line.replace(/ /g, '&nbsp;') || '&nbsp;'}</div>`;
        }
    });

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
        <h2>Original Key: ${songKey}</h2>
        ${htmlLines.join('')}
    </body>
    </html>`;

    // 2. Open a hidden browser, load the HTML, and print to PDF!
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    
    const pdfBuffer = await page.pdf({ 
        format: 'Letter',
        margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }
    });
    
    await browser.close();
    return pdfBuffer;
}

module.exports = { getFirstSearchResult, fetchUGPage, extractTabData, processAndAlignTabs, createDocxChart, createPdfChart }