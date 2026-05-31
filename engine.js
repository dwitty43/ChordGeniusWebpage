#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const cheerio = require('cheerio');
const { Document, Packer, Paragraph, TextRun, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle, SectionType } = require('docx');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0'
];

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

function getPlayKey(targetKey, capoFret) {
    if (!targetKey || /^nashville$|^1$/i.test(targetKey.trim())) return targetKey;
    const capo = parseInt(capoFret, 10);
    if (!capo || isNaN(capo) || capo <= 0) return targetKey;

    const match = targetKey.trim().match(/^([A-G][#b]?)(m|min|minor)?$/i);
    if (!match) return targetKey;

    const root = match[1];
    const quality = match[2] || '';

    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return targetKey;

    const playIndex = (rootIndex - capo + 12) % 12;
    const targetScale = getPreferredAccidentals(targetKey.trim());
    const playRoot = targetScale[playIndex];
    
    return playRoot + quality;
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

function transposeChord(chordString, originalKey, targetKey, capoFret = 0) {
    if (/^[|()\[\]{}:\-~,]+$/.test(chordString)) return chordString;

    const match = chordString.match(/^(\(?)(.*?)(\)?)$/);
    const prefix = match[1] || '';
    const rawChord = match[2];
    const suffix = match[3] || '';

    if (/^N\.?C\.?$/i.test(rawChord)) return prefix + rawChord + suffix;

    // Determine target format
    const isTargetNashville = !targetKey || /^nashville$|^1$/i.test(targetKey.trim());
    const isSourceNashville = !originalKey || /^nashville$/i.test(originalKey.trim());

    let finalTargetKey = targetKey;
    const capo = parseInt(capoFret, 10);
    if (capo && capo > 0 && !isTargetNashville && !isSourceNashville) {
        finalTargetKey = getPlayKey(targetKey || originalKey, capo);
    }

    const targetScale = isTargetNashville ? null : getPreferredAccidentals(finalTargetKey.trim());
    const targetKeyIndex = isTargetNashville ? 0 : getNoteIndex(finalTargetKey.trim().replace(/m|min|minor$/i, ''));

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

// A fast, HTTP-only search function that queries DuckDuckGo Lite without launching Puppeteer
async function fastSearchDDGLite(query) {
    try {
        console.log("[Engine] Performing fast DuckDuckGo Lite fetch search...");
        const encodedQuery = encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query);
        const url = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        const res = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        
        if (!res.ok) {
            console.log(`[Engine] DuckDuckGo Lite fetch returned status ${res.status}`);
            return null;
        }
        
        const html = await res.text();
        const $ = cheerio.load(html);
        let found = null;
        
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            
            try { href = decodeURIComponent(href); } catch(e) {}
            
            const match = href.match(/(https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"'\s&?]+-chords-\d+)/i);
            if (match) {
                found = match[1];
                return false; // Break cheerio loop
            }
        });
        
        if (found) {
            console.log(`[Engine] Fast DDG Lite fetch found tab URL: ${found}`);
        }
        return found;
    } catch (e) {
        console.log(`[Engine] DuckDuckGo Lite fast fetch failed: ${e.message}`);
        return null;
    }
}

// A fast fetch to external Scraping APIs (ZenRows/ScrapingBee) to bypass Cloudflare
async function fetchUGPageViaAPI(targetUrl) {
    const zenrowsKey = process.env.ZENROWS_API_KEY;
    const scrapingbeeKey = process.env.SCRAPINGBEE_API_KEY;
    
    if (!zenrowsKey && !scrapingbeeKey) {
        throw new Error("No third-party Scraping API Key configured in environment variables.");
    }
    
    // Try ScrapingBee first (as primary)
    if (scrapingbeeKey) {
        try {
            console.log("[Engine] Fetching target page via ScrapingBee API...");
            const apiGatewayUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingbeeKey}&url=${encodeURIComponent(targetUrl)}&render_js=true&premium_proxy=true`;
            
            const response = await fetch(apiGatewayUrl, {
                method: 'GET',
                headers: { 'Accept-Encoding': 'gzip, deflate, br' }
            });
            
            if (response.ok) {
                return await response.text();
            }
            
            // If response is not ok (credits exhausted, unauthorized, etc.), throw to trigger fallback
            throw new Error(`ScrapingBee returned status ${response.status}: ${response.statusText}`);
        } catch (sbError) {
            console.warn(`[Engine] ScrapingBee request failed: ${sbError.message}`);
            if (zenrowsKey) {
                console.log("[Engine] ScrapingBee credit exhausted or error. Retrying request via ZenRows Scraping API...");
                // Fall through to ZenRows block below
            } else {
                throw sbError; // Propagate if no ZenRows key exists
            }
        }
    }
    
    // Try ZenRows (either as primary if ScrapingBee is missing, or as fallback)
    if (zenrowsKey) {
        console.log("[Engine] Fetching target page via ZenRows Scraping API...");
        const apiGatewayUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(targetUrl)}&js_render=true&premium_proxy=true`;
        
        const response = await fetch(apiGatewayUrl, {
            method: 'GET',
            headers: { 'Accept-Encoding': 'gzip, deflate, br' }
        });
        
        if (!response.ok) {
            throw new Error(`ZenRows returned status ${response.status}: ${response.statusText}`);
        }
        
        return await response.text();
    }
    
    throw new Error("Failed to retrieve page from both Scraping APIs.");
}

// A highly accurate fallback that queries Ultimate Guitar's internal search catalog directly
async function fastSearchUGDirect(query) {
    const useApi = process.env.USE_SCRAPING_API !== 'false';
    const hasKey = process.env.ZENROWS_API_KEY || process.env.SCRAPINGBEE_API_KEY;
    const url = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`;

    if (useApi && hasKey) {
        try {
            console.log(`[Engine] Querying Ultimate Guitar search catalog via Scraping API: ${query}`);
            const html = await fetchUGPageViaAPI(url);
            const $ = cheerio.load(html);
            const storeData = $('.js-store').first().attr('data-content');
            if (storeData) {
                const data = JSON.parse(storeData);
                const results = data.store?.page?.data?.results || [];
                const chordsResults = results.filter(r => r.type === 'Chords' && r.tab_url);
                if (chordsResults.length > 0) {
                    const foundUrl = chordsResults[0].tab_url;
                    console.log(`[Engine] Ultimate Guitar direct catalog found (API): ${foundUrl}`);
                    return foundUrl;
                }
            }
        } catch (apiError) {
            console.warn(`[Engine] Direct search catalog query via API failed: ${apiError.message}. Falling back to standard Puppeteer...`);
        }
    }

    let browser = null;
    try {
        console.log("[Engine] Searching Ultimate Guitar direct catalog...");
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled' 
            ] 
        });
        
        const page = await browser.newPage();
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        await page.setUserAgent(userAgent);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        const storeData = await page.evaluate(() => {
            const el = document.querySelector('.js-store');
            return el ? el.getAttribute('data-content') : null;
        });
        
        await browser.close();
        browser = null;
        
        if (storeData) {
            const data = JSON.parse(storeData);
            const results = data.store?.page?.data?.results || [];
            // Filter for exact "Chords" type results that have a valid URL
            const chordsResults = results.filter(r => r.type === 'Chords' && r.tab_url);
            if (chordsResults.length > 0) {
                const foundUrl = chordsResults[0].tab_url;
                console.log(`[Engine] Ultimate Guitar direct catalog found: ${foundUrl}`);
                return foundUrl;
            }
        }
        return null;
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch(err) {}
        }
        console.log(`[Engine] Ultimate Guitar direct catalog search failed: ${e.message}`);
        return null;
    }
}

async function getFirstSearchResult(query) {
    let tabUrl = null;

    // Attempt 1: Extremely fast HTTP fetch to DuckDuckGo Lite (takes < 200ms, bypasses Puppeteer completely)
    tabUrl = await fastSearchDDGLite(query);
    if (tabUrl) return tabUrl;

    // Attempt 2: Ultimate Guitar's internal catalog search via Puppeteer (highly resilient, captcha-immune catalog lookup)
    tabUrl = await fastSearchUGDirect(query);
    if (tabUrl) return tabUrl;

    // Attempt 3: Legacy search engine scraper fallbacks using Puppeteer
    const encodedQuery = encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query);

    function extractUGLink($) {
        let found = null;
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            
            try { href = decodeURIComponent(href); } catch(e) {}
            
            const match = href.match(/(https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"'\s&?]+-chords-\d+)/i);
            if (match) {
                found = match[1];
                return false;
            }
        });
        return found;
    }

    // Fallback A: DuckDuckGo Lite via Puppeteer
    try {
        console.log("[Engine] Trying DuckDuckGo Lite fallback via Puppeteer...");
        const html = await fetchUGPage(`https://lite.duckduckgo.com/lite/?q=${encodedQuery}`, true);
        tabUrl = extractUGLink(cheerio.load(html));
        if (tabUrl) return tabUrl;
    } catch (e) {
        console.log(`[Engine] DuckDuckGo Puppeteer fallback failed: ${e.message}`);
    }

    // Fallback B: Bing Search via Puppeteer
    try {
        console.log("[Engine] Trying Bing fallback via Puppeteer...");
        const html = await fetchUGPage(`https://www.bing.com/search?q=${encodedQuery}`, true);
        tabUrl = extractUGLink(cheerio.load(html));
        if (tabUrl) return tabUrl;
    } catch (e) {
        console.log(`[Engine] Bing failed: ${e.message}`);
    }

    // Fallback C: Yahoo Search via Puppeteer
    try {
        console.log("[Engine] Trying Yahoo fallback via Puppeteer...");
        const html = await fetchUGPage(`https://search.yahoo.com/search?p=${encodedQuery}`, true);
        tabUrl = extractUGLink(cheerio.load(html));
        if (tabUrl) return tabUrl;
    } catch (e) {
        console.log(`[Engine] Yahoo failed: ${e.message}`);
    }

    throw new Error(`Could not find an Ultimate Guitar chords link for "${query}".`);
}

// Removed duplicate USER_AGENTS declaration from here (now at the top of the file)

async function delay(min = 800, max = 2000) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUGPage(url, isSearch = false) {
    // Check if Scraping API is enabled
    const useApi = process.env.USE_SCRAPING_API !== 'false';
    const hasKey = process.env.ZENROWS_API_KEY || process.env.SCRAPINGBEE_API_KEY;
    
    if (useApi && hasKey) {
        try {
            return await fetchUGPageViaAPI(url);
        } catch (apiError) {
            console.warn(`[Engine] Scraping API failed: ${apiError.message}. Falling back to standard Puppeteer...`);
        }
    }

    // Mimic human delays
    await delay(1000, 2500);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' 
        ] 
    });
    
    const page = await browser.newPage();
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await page.setUserAgent(userAgent);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if (!isSearch) {
            try { await page.waitForSelector('pre', { timeout: 8000 }); } catch (e) {}
        } else {
            await new Promise(r => setTimeout(r, 1000));
        }

        let html = await page.content();
        
        // If Cloudflare blocks us on direct UG fetch, try Google Cache fallback
        const hasPreTag = html.toLowerCase().includes('<pre');
        if (!isSearch && (html.includes("Just a moment...") || html.includes("cf-browser-verification") || !hasPreTag)) {
            console.log("[Engine] Direct page blocked by Cloudflare or missing pre tag. Trying Google Web Cache...");
            const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&strip=0`;
            await page.goto(cacheUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            try { await page.waitForSelector('pre', { timeout: 8000 }); } catch (e) {}
            html = await page.content();
        }

        await browser.close();
        return html;
    } catch (error) {
        if (browser) await browser.close();
        
        // Try fallback to Google Cache on connection error too
        if (!isSearch) {
            console.log(`[Engine] Direct page fetch failed: ${error.message}. Trying Google Web Cache...`);
            let browserFallback;
            try {
                browserFallback = await puppeteer.launch({ 
                    headless: "new", 
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
                });
                const pageFallback = await browserFallback.newPage();
                await pageFallback.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
                const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&strip=0`;
                await pageFallback.goto(cacheUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                try { await pageFallback.waitForSelector('pre', { timeout: 8000 }); } catch (e) {}
                const htmlFallback = await pageFallback.content();
                await browserFallback.close();
                return htmlFallback;
            } catch (eFallback) {
                if (browserFallback) await browserFallback.close();
            }
        }
        
        throw new Error(`Puppeteer failed: ${error.message}`);
    }
}

function extractTabData(html) {
    if (html.includes("Just a moment...") || html.includes("cf-browser-verification")) {
        throw new Error("Cloudflare intercepted the browser.");
    }
    if (html.includes("Sorry, this artist has told us we can't show this tab") || html.includes("has told us we can't show this tab")) {
        throw new Error("This artist has blocked public access to their chords on Ultimate Guitar due to licensing restrictions.");
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

function isLyricLine(line) {
    if (!line) return false;
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (isChordLine(line) || isNashvilleLine(line) || isTabLine(line) || isNoiseLine(line)) return false;
    if (/^\[?(Intro|Verse|Chorus|Pre-Chorus|Bridge|Outro|Solo|Instrumental)[^\]]*\]?$/i.test(trimmed)) return false;
    return true;
}

function haveLostAlignment(chordLine) {
    const tokens = chordLine.trim().split(/\s+/);
    if (tokens.length < 2) return false;
    const spaces = chordLine.match(/\s+/g) || [];
    return spaces.every(s => s.length <= 3);
}

// --- TEXT PROCESSING ---
function processAndAlignTabs(rawText, originalKey, targetKey, isPdf = false, simplify = false, capo = 0) {
    let lines = rawText.split('\n');

    // PDF Preprocessor: Rejoin split Y-axis superscript chord extensions
    if (isPdf) {
        const mergedLines = [];
        const extensionOnlyRegex = /^(?:[0-9m]|maj|min|dim|aug|sus|add|M|b|#|\+|\-|\/|b5|NC|\s)+$/i;
        for (let k = 0; k < lines.length; k++) {
            const line = lines[k];
            const nextLine = lines[k + 1];
            if (nextLine !== undefined && (isChordLine(line) || isNashvilleLine(line))) {
                const nextTrimmed = nextLine.trim();
                if (nextTrimmed !== '' && extensionOnlyRegex.test(nextTrimmed) && !isChordLine(nextLine) && !isNashvilleLine(nextLine)) {
                    mergedLines.push(line + nextTrimmed);
                    k++;
                    continue;
                } else if (nextTrimmed === '7' || nextTrimmed === '7b5' || nextTrimmed === 'maj7' || nextTrimmed === 'sus4') {
                    mergedLines.push(line + nextTrimmed);
                    k++;
                    continue;
                }
            }
            mergedLines.push(line);
        }
        lines = mergedLines;
    }

    let processedLines = [];
    let hasStarted = false; 

    let currentOriginalKey = originalKey;
    let currentTargetKey = targetKey;
    const isTargetNashville = !targetKey || /^nashville$|^1$/i.test(targetKey.trim());
    
    let userTranspositionInterval = 0;
    if (!isTargetNashville && originalKey && targetKey) {
        const cleanOriginalStartingKey = originalKey.trim().replace(/m|min|minor$/i, '');
        const cleanTargetKey = targetKey.trim().replace(/m|min|minor$/i, '');
        const indexOrig = getNoteIndex(cleanOriginalStartingKey);
        const indexTarget = getNoteIndex(cleanTargetKey);
        if (indexOrig !== -1 && indexTarget !== -1) {
            userTranspositionInterval = (indexTarget - indexOrig + 12) % 12;
        }
    }

    const keyChangeRegex = /\[Key(?: Change)?:?\s*([A-G][#b]?(?:m)?)\]/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const keyChangeMatch = trimmed.match(keyChangeRegex);
        if (keyChangeMatch) {
            hasStarted = true;
            const newKey = keyChangeMatch[1];
            currentOriginalKey = newKey;
            
            if (!isTargetNashville) {
                const isNewKeyMinor = /[m|min|minor]$/i.test(newKey.trim());
                const cleanNewKey = newKey.trim().replace(/m|min|minor$/i, '');
                const cleanNewKeyIndex = getNoteIndex(cleanNewKey);
                if (cleanNewKeyIndex !== -1) {
                    const newTargetKeyIndex = (cleanNewKeyIndex + userTranspositionInterval) % 12;
                    const targetScale = getPreferredAccidentals(targetKey.trim());
                    currentTargetKey = targetScale[newTargetKeyIndex] + (isNewKeyMinor ? 'm' : '');
                }
            } else {
                currentTargetKey = targetKey;
            }

            let transposedLine = line.replace(/(\[Key(?: Change)?:?\s*)([A-G][#b]?(?:m)?)(\])/i, (match, p1, p2, p3) => {
                if (isTargetNashville) {
                    return `${p1}1${p3}`;
                } else {
                    return `${p1}${currentTargetKey}${p3}`;
                }
            });

            processedLines.push(transposedLine);
            continue;
        }

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
            let nextLine = lines[i + 1];
            if (isPdf && isLyricLine(nextLine) && haveLostAlignment(line)) {
                // Split the chord line into individual chord tokens
                const chords = line.trim().split(/\s+/);
                
                // Transpose and simplify chords first
                const processedChords = chords.map(chord => {
                    let newChord = transposeChord(chord, currentOriginalKey, currentTargetKey, capo);
                    if (simplify && !/^[|()\[\]{}:\-~,]+$/.test(chord) && !/^N\.?C\.?$/i.test(chord.replace(/[()]/g, ''))) {
                        newChord = simplifyChord(newChord);
                    }
                    return newChord;
                });

                // Split the lyric line into words with character indices
                const words = [];
                const wordRegex = /\S+/g;
                let match;
                while ((match = wordRegex.exec(nextLine)) !== null) {
                    words.push({
                        text: match[0],
                        index: match.index
                    });
                }

                const N = chords.length;
                const chordPlacements = [];
                for (let j = 0; j < N; j++) {
                    const chord = processedChords[j];
                    let targetCharIndex;
                    if (words.length >= N) {
                        const w_j = N > 1 ? Math.round((j * (words.length - 1)) / (N - 1)) : 0;
                        targetCharIndex = words[w_j].index;
                    } else {
                        const lengthToDistribute = Math.max(nextLine.length, N * 4);
                        targetCharIndex = N > 1 ? Math.round((j * lengthToDistribute) / (N - 1)) : 0;
                    }
                    
                    // Whitespace Restoration: prevent overlaps and maintain spacing
                    if (j > 0) {
                        const prevPlacement = chordPlacements[j - 1];
                        const minPos = prevPlacement.index + prevPlacement.chord.length + 1;
                        if (targetCharIndex < minPos) {
                            targetCharIndex = minPos;
                        }
                    }
                    chordPlacements.push({ chord, index: targetCharIndex });
                }

                // Construct new aligned chord line
                let newLine = '';
                for (const placement of chordPlacements) {
                    if (newLine.length < placement.index) {
                        newLine += ' '.repeat(placement.index - newLine.length);
                    }
                    newLine += placement.chord;
                }
                processedLines.push(newLine);
            } else {
                let newLine = line.replace(/(\S+)(\s*)/g, (match, chord, spaces) => {
                    let newChord = transposeChord(chord, currentOriginalKey, currentTargetKey, capo);
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
            }
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

async function createDocxChart(finalChartText, songTitle, originalKey, targetKey, bpm, capo = 0, timeSignature = '', columns = '1') {
    const cleanText = finalChartText.replace(/\x1B\[\d+m/g, ''); 
    const lines = cleanText.split('\n');

    // Helper function to map song lines to document paragraph objects
    function mapSongLines(songLines, fontSize) {
        return songLines.map(line => {
            if (isNashvilleLine(line) || isChordLine(line)) {
                const runs = [];
                const regex = /(\S+)(\s*)/g;
                let match;

                while ((match = regex.exec(line)) !== null) {
                    const chord = match[1];
                    const spaces = match[2];

                    if (/^[|()\[\]{}:\-~,]+$/.test(chord)) {
                        runs.push(new TextRun({ text: chord, font: "Courier New", size: fontSize, bold: true }));
                        if (spaces) runs.push(new TextRun({ text: spaces, font: "Courier New", size: fontSize }));
                        continue;
                    }

                    const fixMatch = chord.match(/^(\(?)(.*?)(\)?)$/);
                    const prefix = fixMatch[1] || '';
                    const rawChord = fixMatch[2];
                    const suffix = fixMatch[3] || '';

                    if (prefix) runs.push(new TextRun({ text: prefix, font: "Courier New", size: fontSize, bold: true }));

                    const chordParts = rawChord.split('/');
                    const mainChord = chordParts[0];
                    const bassNote = chordParts[1]; 

                    const rootMatch = mainChord.match(/^([b#]?[1-7]|[A-Ga-g][b#]?)(.*)$/);

                    if (rootMatch) {
                        const root = rootMatch[1];
                        const rawExtension = rootMatch[2];

                        runs.push(new TextRun({ text: root, font: "Courier New", size: fontSize, bold: true }));

                        if (rawExtension) {
                            const extMatch = rawExtension.match(/^(\D*)(\d.*)?$/);
                            if (extMatch) {
                                if (extMatch[1]) runs.push(new TextRun({ text: extMatch[1], font: "Courier New", size: fontSize, bold: true }));
                                if (extMatch[2]) runs.push(new TextRun({ text: extMatch[2], font: "Courier New", size: fontSize, bold: true, superScript: true }));
                            }
                        }
                        if (bassNote) runs.push(new TextRun({ text: `/${bassNote}`, font: "Courier New", size: fontSize, bold: true }));
                    } else {
                        runs.push(new TextRun({ text: rawChord, font: "Courier New", size: fontSize, bold: true }));
                    }

                    if (suffix) runs.push(new TextRun({ text: suffix, font: "Courier New", size: fontSize, bold: true }));
                    if (spaces) runs.push(new TextRun({ text: spaces, font: "Courier New", size: fontSize }));
                }
                return new Paragraph({ children: runs });
            } else {
                return new Paragraph({ children: [ new TextRun({ text: line, font: "Courier New", size: fontSize })] });
            }
        });
    }

    // Check if we are dealing with a Setlist Binder
    const isBinder = songTitle === "Setlist_Binder" || songTitle === "Setlist Binder" || (songTitle && songTitle.toLowerCase().includes("binder")) || finalChartText.includes("=== SONG ");
    const sections = [];

    if (isBinder) {
        // Parse songs from the combined text
        const songs = [];
        let currentSong = null;

        for (const line of lines) {
            const match = line.match(/^===\s*SONG\s*\d+:\s*(.*?)\s*===$/i);
            if (match) {
                if (currentSong) {
                    songs.push(currentSong);
                }
                currentSong = {
                    title: match[1],
                    keyText: "",
                    lines: []
                };
            } else if (currentSong) {
                if (line.startsWith("Key: ") && currentSong.lines.length === 0) {
                    currentSong.keyText = line;
                } else {
                    currentSong.lines.push(line);
                }
            }
        }
        if (currentSong) {
            songs.push(currentSong);
        }

        // Section 1: Binder Cover Page (1 column)
        const coverChildren = [
            new Paragraph({ children: [ new TextRun({ text: "", font: "Courier New" }) ], spacing: { before: 2400 } }),
            new Paragraph({
                children: [ new TextRun({ text: songTitle.toUpperCase(), font: "Courier New", size: 48, bold: true }) ],
                alignment: "center",
                spacing: { after: 600 }
            }),
            new Paragraph({
                children: [ new TextRun({ text: "Generated by Chord Genius Studio", font: "Courier New", size: 24, italic: true }) ],
                alignment: "center",
                spacing: { after: 1200 }
            })
        ];

        songs.forEach((song, idx) => {
            const displayKey = song.keyText.replace('Key: ', '');
            coverChildren.push(new Paragraph({
                children: [ new TextRun({ text: `${idx + 1}. ${song.title.toUpperCase()} (${displayKey})`, font: "Courier New", size: 24 }) ],
                alignment: "center",
                spacing: { after: 200 }
            }));
        });

        sections.push({
            properties: { column: { count: 1 } },
            children: coverChildren
        });

        // For each song: Split Title & Metadata (1 col) and Body (columns col)
        for (let i = 0; i < songs.length; i++) {
            const song = songs[i];
            const fontScale = columns === '2' ? 18 : 24;

            const titleParagraph = new Paragraph({
                children: [ new TextRun({ text: song.title.toUpperCase(), font: "Courier New", size: columns === '2' ? 24 : 32, bold: true }) ],
                spacing: { before: 400, after: 200 }
            });

            // Metadata row table
            const headerTextParts = song.keyText.replace('Key: ', '').split(' | ');
            const cells = headerTextParts.map(part => {
                return new TableCell({
                    width: { size: 100 / headerTextParts.length, type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({
                            children: [ new TextRun({ text: part, font: "Courier New", size: fontScale, bold: true }) ],
                            alignment: "center"
                        })
                    ]
                });
            });

            const metadataTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    insideHorizontal: { style: BorderStyle.NONE },
                    insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                    new TableRow({ children: cells })
                ]
            });

            sections.push({
                properties: { column: { count: 1 } },
                children: [
                    titleParagraph,
                    metadataTable,
                    new Paragraph({ children: [], spacing: { after: 400 } })
                ]
            });

            const bodyChildren = mapSongLines(song.lines, fontScale);
            sections.push({
                properties: {
                    type: SectionType.CONTINUOUS,
                    column: columns === '2' ? { count: 2, space: 720, equalWidth: true } : { count: 1 }
                },
                children: bodyChildren
            });
        }
    } else {
        // Single song
        const isTargetNashville = !targetKey || /^nashville$|^1$/i.test(targetKey.trim());
        const isSourceNashville = !originalKey || /^nashville$/i.test(originalKey.trim());
        const capoVal = parseInt(capo, 10);
        const fontScale = columns === '2' ? 18 : 24;

        let keyText = `Key: ${formatKeyDisplay(targetKey)}`;
        if (isTargetNashville) {
            keyText = isSourceNashville ? 'Nashville Numbers' : `Key: ${formatKeyDisplay(originalKey)}`;
        } else {
            if (originalKey && originalKey !== targetKey) {
                keyText += ` (Original: ${formatKeyDisplay(originalKey)})`;
            }
            if (capoVal && capoVal > 0 && !isSourceNashville) {
                const playKey = getPlayKey(targetKey, capoVal);
                keyText += ` | Capo: ${capoVal} | Play: ${formatKeyDisplay(playKey)}`;
            }
        }

        let headerTextParts = [];
        headerTextParts.push(keyText);
        if (bpm) {
            headerTextParts.push(`BPM: ${bpm}`);
        }
        if (timeSignature) {
            let formattedTimeSig = timeSignature;
            if (typeof timeSignature === 'number' || !isNaN(Number(timeSignature))) {
                const num = Number(timeSignature);
                if (num === 4) formattedTimeSig = '4/4';
                else if (num === 3) formattedTimeSig = '3/4';
                else if (num === 2) formattedTimeSig = '2/4';
                else if (num === 6) formattedTimeSig = '6/8';
                else formattedTimeSig = `${num}/4`;
            }
            headerTextParts.push(`Time Sig: ${formattedTimeSig}`);
        }

        // Section 1: Title and Metadata Row (1 column)
        const titleParagraph = new Paragraph({
            children: [ new TextRun({ text: songTitle.toUpperCase(), font: "Courier New", size: columns === '2' ? 24 : 32, bold: true }) ],
            spacing: { after: 200 }
        });

        const cells = headerTextParts.map(part => {
            return new TableCell({
                width: { size: 100 / headerTextParts.length, type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        children: [ new TextRun({ text: part, font: "Courier New", size: fontScale, bold: true }) ],
                        alignment: "center"
                    })
                ]
            });
        });

        const metadataTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
                insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
                new TableRow({ children: cells })
            ]
        });

        sections.push({
            properties: { column: { count: 1 } },
            children: [
                titleParagraph,
                metadataTable,
                new Paragraph({ children: [], spacing: { after: 400 } })
            ]
        });

        // Section 2: Song Body (1 or 2 columns)
        const bodyChildren = mapSongLines(lines, fontScale);
        sections.push({
            properties: {
                type: SectionType.CONTINUOUS,
                column: columns === '2' ? { count: 2, space: 720, equalWidth: true } : { count: 1 }
            },
            children: bodyChildren
        });
    }

    const doc = new Document({
        sections: sections
    });
    
    return await Packer.toBuffer(doc);
}

// --- CHORD SVG DICTIONARY & GENERATOR ---

const chordDictionary = {
    // Major chords
    'C': { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    'C#': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 3, 3, 3, 1], baseFret: 4 },
    'Db': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 3, 3, 3, 1], baseFret: 4 },
    'D': { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    'D#': { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 3, 3, 3, 1], baseFret: 6 },
    'Eb': { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 3, 3, 3, 1], baseFret: 6 },
    'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
    'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
    'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 2 },
    'Gb': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 2 },
    'G': { frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] },
    'G#': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4 },
    'Ab': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4 },
    'A': { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
    'A#': { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 3, 3, 3, 1], baseFret: 1 },
    'Bb': { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 3, 3, 3, 1], baseFret: 1 },
    'B': { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 3, 3, 3, 1], baseFret: 2 },

    // Minor chords
    'Cm': { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3 },
    'C#m': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], baseFret: 4 },
    'Dbm': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], baseFret: 4 },
    'Dm': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    'D#m': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], baseFret: 6 },
    'Ebm': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], baseFret: 6 },
    'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
    'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1 },
    'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 2 },
    'Gbm': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 2 },
    'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3 },
    'G#m': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 4 },
    'Abm': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 4 },
    'Am': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
    'A#m': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1 },
    'Bbm': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1 },
    'Bm': { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2 },

    // Dominant 7th
    'C7': { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
    'C#7': { frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], baseFret: 4 },
    'Db7': { frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], baseFret: 4 },
    'D7': { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    'D#7': { frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], baseFret: 6 },
    'Eb7': { frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], baseFret: 6 },
    'E7': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
    'F7': { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1 },
    'F#7': { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], baseFret: 2 },
    'Gb7': { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], baseFret: 2 },
    'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
    'G#7': { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], baseFret: 4 },
    'Ab7': { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], baseFret: 4 },
    'A7': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
    'A#7': { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], baseFret: 1 },
    'Bb7': { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], baseFret: 1 },
    'B7': { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },

    // Major 7th
    'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
    'Dmaj7': { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] },
    'Emaj7': { frets: [0, 2, 1, 1, 0, 0], fingers: [0, 2, 1, 1, 0, 0] },
    'Fmaj7': { frets: [-1, 3, 3, 2, 1, 0], fingers: [0, 3, 4, 2, 1, 0] },
    'Gmaj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] },
    'Amaj7': { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
    'Bmaj7': { frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1], baseFret: 2 },

    // Minor 7th
    'Cm7': { frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], baseFret: 3 },
    'C#m7': { frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1], baseFret: 4 },
    'Dm7': { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
    'Em7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 1, 0, 0, 0, 0] },
    'Fm7': { frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1 },
    'Gm7': { frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], baseFret: 3 },
    'Am7': { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
    'Bm7': { frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1], baseFret: 2 },

    // Suspended
    'Csus4': { frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] },
    'Dsus4': { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
    'Esus4': { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },
    'Gsus4': { frets: [3, -1, 0, 0, 1, 3], fingers: [3, 0, 0, 0, 1, 4] },
    'Asus4': { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] },
    'Csus2': { frets: [-1, 3, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4] },
    'Dsus2': { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] },
    'Asus2': { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },

    // Cadd9, Gadd9
    'Cadd9': { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0] },
    'Gadd9': { frets: [3, 2, 0, 0, 0, 5], fingers: [1, 2, 0, 0, 0, 4], baseFret: 1 }
};

function getChordSvg(chordName) {
    let chord = chordDictionary[chordName];
    if (!chord) {
        let rootOnly = chordName.split('/')[0];
        chord = chordDictionary[rootOnly];
        if (!chord) {
            const match = chordName.match(/^([A-G][#b]?m?)/);
            if (match) {
                chord = chordDictionary[match[1]];
            }
        }
    }
    if (!chord) return null;

    const frets = chord.frets;
    const fingers = chord.fingers || [0, 0, 0, 0, 0, 0];
    const baseFret = chord.baseFret || 1;

    const width = 80;
    const height = 90;
    const topMargin = 20;
    const leftMargin = 15;
    const stringSpacing = 10;
    const fretSpacing = 12;

    let stringsHtml = '';
    for (let i = 0; i < 6; i++) {
        const x = leftMargin + i * stringSpacing;
        stringsHtml += `<line x1="${x}" y1="${topMargin}" x2="${x}" y2="${topMargin + 4 * fretSpacing}" stroke="#000000" stroke-width="1" />`;
    }

    let fretsHtml = '';
    for (let i = 0; i < 5; i++) {
        const y = topMargin + i * fretSpacing;
        const strokeWidth = (i === 0 && baseFret === 1) ? 3 : 1;
        fretsHtml += `<line x1="${leftMargin}" y1="${y}" x2="${leftMargin + 5 * stringSpacing}" y2="${y}" stroke="#000000" stroke-width="${strokeWidth}" />`;
    }

    let fretNumHtml = '';
    if (baseFret > 1) {
        fretNumHtml = `<text x="${leftMargin - 8}" y="${topMargin + fretSpacing / 2 + 3}" font-family="Arial, sans-serif" font-size="8px" text-anchor="middle" font-weight="bold">${baseFret}fr</text>`;
    }

    let markersHtml = '';
    for (let s = 0; s < 6; s++) {
        const fret = frets[s];
        const x = leftMargin + s * stringSpacing;
        if (fret === -1) {
            markersHtml += `<text x="${x}" y="${topMargin - 5}" font-family="Arial, sans-serif" font-size="8px" text-anchor="middle" font-weight="bold" fill="#000000">X</text>`;
        } else if (fret === 0) {
            markersHtml += `<circle cx="${x}" cy="${topMargin - 6}" r="2" fill="none" stroke="#000000" stroke-width="1" />`;
        }
    }

    let fingersHtml = '';
    for (let s = 0; s < 6; s++) {
        const fret = frets[s];
        if (fret > 0) {
            const visualFret = fret - baseFret + 1;
            if (visualFret >= 1 && visualFret <= 4) {
                const x = leftMargin + s * stringSpacing;
                const y = topMargin + (visualFret - 1) * fretSpacing + fretSpacing / 2;
                fingersHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#000000" />`;
                const fingerNum = fingers[s];
                if (fingerNum > 0) {
                    fingersHtml += `<text x="${x}" y="${y + 2}" font-family="Arial, sans-serif" font-size="6px" text-anchor="middle" fill="#FFFFFF">${fingerNum}</text>`;
                }
            }
        }
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="${width / 2}" y="10" font-family="Arial, sans-serif" font-size="11px" font-weight="bold" text-anchor="middle" fill="#000000">${chordName}</text>` +
        stringsHtml +
        fretsHtml +
        fretNumHtml +
        markersHtml +
        fingersHtml +
        `</svg>`;
}

async function createPdfChart(finalChartText, songTitle, originalKey, targetKey, bpm, capo = 0, timeSignature = '', columns = '1') {
    const lines = finalChartText.split('\n');
    
    // Check if we are dealing with a Setlist Binder
    const isBinder = songTitle === "Setlist_Binder" || songTitle === "Setlist Binder" || (songTitle && songTitle.toLowerCase().includes("binder")) || finalChartText.includes("=== SONG ");
    
    // Scan for unique chords
    const uniqueChords = new Set();
    for (const line of lines) {
        if (isChordLine(line)) {
            const tokens = line.trim().split(/\s+/);
            for (const token of tokens) {
                const cleaned = token.replace(/[()\[\]{}*]/g, '');
                if (/^[A-G][#b]?(?:m|min|maj|M|dim|aug|sus|add|o|\+|\-|\d|[#b])*(?:\/[A-G][#b]?)?$/.test(cleaned)) {
                    uniqueChords.add(cleaned);
                }
            }
        }
    }

    const svgCards = [];
    const sortedChords = Array.from(uniqueChords).sort();
    for (const chord of sortedChords) {
        const svg = getChordSvg(chord);
        if (svg) {
            svgCards.push(`<div class="chord-diagram-card">${svg}</div>`);
        }
    }

    let glossaryHtml = '';
    if (svgCards.length > 0) {
        glossaryHtml = `<div class="chord-diagram-container">${svgCards.join('')}</div>`;
    }
    
    // Helper function to map lines of a single song to HTML lines
    function mapSongHtmlLines(songLines) {
        return songLines.map(line => {
            const isHeader = /^\[?(Intro|Verse|Chorus|Pre-Chorus|Bridge|Outro|Solo|Instrumental)[^\]]*\]?$/i.test(line.trim());
            const extraClass = isHeader ? ' header' : '';
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
                return `<div class="line${extraClass}">${htmlLine || '&nbsp;'}</div>`;
            } else {
                return `<div class="line${extraClass}">${line.replace(/ /g, '&nbsp;') || '&nbsp;'}</div>`;
            }
        });
    }

    let mainContentHtml = '';
    let coverHtml = '';
    const songs = [];

    if (isBinder) {
        // Parse songs from combined text
        let currentSong = null;

        for (const line of lines) {
            const match = line.match(/^===\s*SONG\s*\d+:\s*(.*?)\s*===$/i);
            if (match) {
                if (currentSong) {
                    songs.push(currentSong);
                }
                currentSong = {
                    title: match[1],
                    keyText: "",
                    lines: []
                };
            } else if (currentSong) {
                if (line.startsWith("Key: ") && currentSong.lines.length === 0) {
                    currentSong.keyText = line;
                } else {
                    currentSong.lines.push(line);
                }
            }
        }
        if (currentSong) {
            songs.push(currentSong);
        }

        // Generate Cover Page HTML
        const coverSongsHtml = songs.map((song, i) => `
            <div class="cover-song-item" style="margin-bottom: 10px;">${i + 1}. ${song.title.toUpperCase()} (${song.keyText.replace('Key: ', '')})</div>
        `).join('');
        coverHtml = `
            <div class="binder-cover-page" style="page-break-after: always; text-align: center; padding-top: 150px; box-sizing: border-box; font-family: 'Courier New', Courier, monospace;">
                <h1 style="font-size: 48px; margin-bottom: 20px; font-weight: bold; text-transform: uppercase;">${songTitle.toUpperCase()}</h1>
                <h3 style="font-size: 20px; font-style: italic; margin-bottom: 60px; color: #666;">Generated by Chord Genius Studio</h3>
                <div style="display: inline-block; text-align: left; font-size: 18px; line-height: 2;">
                    ${coverSongsHtml}
                </div>
            </div>
        `;

        const songSections = songs.map((song, i) => {
            const htmlLinesForSong = mapSongHtmlLines(song.lines);
            const pageBreakStyle = i > 0 ? ' style="page-break-before: always;"' : '';
            return `
                <div class="song-section"${pageBreakStyle}>
                    <h1 class="song-title">${song.title}</h1>
                    <h2 class="song-metadata">${song.keyText}</h2>
                    <div class="chart-container">
                        ${htmlLinesForSong.join('')}
                    </div>
                </div>
            `;
        });
        mainContentHtml = songSections.join('');
    } else {
        // Single song HTML content
        const htmlLines = mapSongHtmlLines(lines);

        let headerTextParts = [];
        const isTargetNashville = !targetKey || /^nashville$|^1$/i.test(targetKey.trim());
        const isSourceNashville = !originalKey || /^nashville$/i.test(originalKey.trim());
        const capoVal = parseInt(capo, 10);

        let keyText = `Key: ${formatKeyDisplay(targetKey)}`;
        if (isTargetNashville) {
            keyText = isSourceNashville ? 'Nashville Numbers' : `Key: ${formatKeyDisplay(originalKey)}`;
        } else {
            if (originalKey && originalKey !== targetKey) {
                keyText += ` (Original: ${formatKeyDisplay(originalKey)})`;
            }
            if (capoVal && capoVal > 0 && !isSourceNashville) {
                const playKey = getPlayKey(targetKey, capoVal);
                keyText += ` | Capo: ${capoVal} | Play: ${formatKeyDisplay(playKey)}`;
            }
        }
        headerTextParts.push(keyText);
        if (bpm) {
            headerTextParts.push(`BPM: ${bpm}`);
        }
        if (timeSignature) {
            let formattedTimeSig = timeSignature;
            if (typeof timeSignature === 'number' || !isNaN(Number(timeSignature))) {
                const num = Number(timeSignature);
                if (num === 4) formattedTimeSig = '4/4';
                else if (num === 3) formattedTimeSig = '3/4';
                else if (num === 2) formattedTimeSig = '2/4';
                else if (num === 6) formattedTimeSig = '6/8';
                else formattedTimeSig = `${num}/4`;
            }
            headerTextParts.push(`Time Sig: ${formattedTimeSig}`);
        }
        const headerKeyText = headerTextParts.join(' | ');

        mainContentHtml = `
            <h1 class="song-title">${songTitle}</h1>
            <h2 class="song-metadata">${headerKeyText}</h2>
            <div class="chart-container">
                ${htmlLines.join('')}
            </div>
        `;
    }

    let containerStyle = '';
    let headerStyle = '';
    if (columns === '2') {
        containerStyle = `
            .chart-container {
                column-count: 2;
                column-gap: 30px;
                column-fill: auto;
                height: 100%;
            }
        `;
        headerStyle = `
            .line.header {
                break-inside: avoid;
            }
            .song-section {
                break-inside: avoid;
            }
        `;
    }

    // Dynamic monospaced font scaling layout properties
    let bodyFontSize = columns === '2' ? '12px' : '16px';
    let h1FontSize = columns === '2' ? '24px' : '32px';
    let h2FontSize = columns === '2' ? '18px' : '24px';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: ${bodyFontSize}; margin: 40px; color: #000; }
            .song-title { font-size: ${h1FontSize}; margin-bottom: 5px; text-transform: uppercase; font-weight: bold; }
            .song-metadata { font-size: ${h2FontSize}; margin-bottom: 30px; font-weight: bold; }
            .line { line-height: 1.2; white-space: nowrap; }
            sup { font-size: 75%; }
            ${containerStyle}
            ${headerStyle}
            .chord-diagram-container { display: flex; flex-wrap: wrap; gap: 15px; border-top: 1px solid #ccc; padding-top: 20px; margin-top: 40px; page-break-inside: avoid; break-inside: avoid; }
            .chord-diagram-card { text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        ${coverHtml}
        ${mainContentHtml}
        ${glossaryHtml}
    </body>
    </html>`;

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    
    const pdfBuffer = await page.pdf({ format: 'Letter', margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }});
    await browser.close();
    return pdfBuffer;
}


// --- CHORDPRO CONVERSION UTILITIES ---

function chordProToLineBased(chordProText) {
    const lines = chordProText.split(/\r?\n/);
    let title = '';
    let key = '';
    let processedLines = [];

    for (let line of lines) {
        let trimmed = line.trim();
        
        // 1. Directives
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const directive = trimmed.slice(1, -1).trim();
            const colonIndex = directive.indexOf(':');
            
            let name = directive;
            let value = '';
            if (colonIndex !== -1) {
                name = directive.slice(0, colonIndex).trim().toLowerCase();
                value = directive.slice(colonIndex + 1).trim();
            } else {
                name = directive.toLowerCase();
            }

            if (name === 'title' || name === 't') {
                title = value;
            } else if (name === 'key' || name === 'k') {
                key = value;
            } else if (name === 'comment' || name === 'c') {
                processedLines.push(`[${value}]`);
            } else if (name === 'soc') {
                processedLines.push('[Chorus]');
            } else if (name === 'eoc') {
                processedLines.push('');
            } else if (name === 'sot' || name === 'eot') {
                // Ignore start/end of tab
            }
            continue;
        }

        // 2. Standard ChordPro line containing chords inside brackets like [C]
        if (line.includes('[') && line.includes(']')) {
            let chordLine = '';
            let lyricLine = '';
            
            const regex = /\[([^\]]+)\]/g;
            let match;
            let lastIndex = 0;
            
            while ((match = regex.exec(line)) !== null) {
                const chord = match[1];
                const matchIndex = match.index;
                
                // Add the text before the chord to lyricLine
                const textBefore = line.slice(lastIndex, matchIndex);
                lyricLine += textBefore;
                
                // Position where chord should be in chordLine
                const targetPos = lyricLine.length;
                
                // Pad chordLine with spaces up to targetPos
                if (chordLine.length < targetPos) {
                    chordLine += ' '.repeat(targetPos - chordLine.length);
                }
                
                chordLine += chord;
                lastIndex = regex.lastIndex;
            }
            
            // Append any remaining text after the last chord
            lyricLine += line.slice(lastIndex);
            
            // If the lyricLine is just spaces, we only output the chordLine
            if (lyricLine.trim() === '') {
                processedLines.push(chordLine);
            } else {
                processedLines.push(chordLine);
                processedLines.push(lyricLine);
            }
        } else {
            // Normal lyric or text line without chords
            processedLines.push(line);
        }
    }
    
    return {
        title: title || 'Untitled',
        key: key || '',
        text: processedLines.join('\n')
    };
}

function lineBasedToChordPro(lineBasedText, title = '', key = '') {
    const lines = lineBasedText.split(/\r?\n/);
    const chordProLines = [];

    // Prepend title and key if provided
    if (title) chordProLines.push(`{title: ${title}}`);
    if (key) chordProLines.push(`{key: ${key}}`);
    if (title || key) chordProLines.push(''); // blank line after metadata

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 1. Bracketed section headers like [Verse 1]
        const headerMatch = line.trim().match(/^\[([^\]]+)\]$/);
        if (headerMatch) {
            chordProLines.push(`{c: ${headerMatch[1]}}`);
            continue;
        }

        // 2. Check if this is a chord/Nashville line
        if (isChordLine(line) || isNashvilleLine(line)) {
            const nextLine = lines[i + 1];
            
            const hasLyricLine = nextLine !== undefined && 
                                 nextLine.trim() !== '' && 
                                 !isChordLine(nextLine) && 
                                 !isNashvilleLine(nextLine) && 
                                 !isTabLine(nextLine) && 
                                 !isNoiseLine(nextLine) &&
                                 !/^\[([^\]]+)\]$/.test(nextLine.trim());
            
            if (hasLyricLine) {
                // Find all chord tokens and their starting indices in line
                const regex = /\S+/g;
                const chords = [];
                let match;
                while ((match = regex.exec(line)) !== null) {
                    chords.push({
                        chord: match[0],
                        index: match.index
                    });
                }

                // Construct the merged ChordPro line
                let mergedLine = '';
                const lyricText = nextLine;
                const maxLen = Math.max(lyricText.length, chords.length > 0 ? chords[chords.length - 1].index : 0);
                
                let chordIndex = 0;
                for (let j = 0; j <= maxLen; j++) {
                    if (chordIndex < chords.length && chords[chordIndex].index === j) {
                        mergedLine += `[${chords[chordIndex].chord}]`;
                        chordIndex++;
                    }
                    if (j < lyricText.length) {
                        mergedLine += lyricText[j];
                    } else if (chordIndex < chords.length) {
                        mergedLine += ' ';
                    }
                }
                
                chordProLines.push(mergedLine);
                i++; // Skip the next line as it was merged
            } else {
                // Standalone chord line with no lyric line underneath it
                const regex = /(\S+)(\s*)/g;
                let match;
                let standaloneLine = '';
                while ((match = regex.exec(line)) !== null) {
                    standaloneLine += `[${match[1]}]${match[2]}`;
                }
                chordProLines.push(standaloneLine);
            }
        } else {
            // Normal lyric line, blank line, or other text
            chordProLines.push(line);
        }
    }

    return chordProLines.join('\n');
}

module.exports = { 
    getFirstSearchResult, 
    fetchUGPage, 
    extractTabData, 
    processAndAlignTabs, 
    createDocxChart, 
    createPdfChart,
    chordProToLineBased,
    lineBasedToChordPro,
    getPlayKey,
    getChordSvg
}
