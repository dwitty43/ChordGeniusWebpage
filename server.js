const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse'); // NEW: Import the PDF parser

const { 
    getFirstSearchResult, 
    fetchUGPage, 
    extractTabData, 
    processAndAlignTabs, 
    createDocxChart,
    createPdfChart,
    chordProToLineBased,
    lineBasedToChordPro
} = require('./engine'); 

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

async function deliverFile(res, finalChart, originalName, originalKey, targetKey, format, bpm) {
    let fileBuffer;
    let contentType;
    let extension;

    if (format === 'pdf') {
        fileBuffer = await createPdfChart(finalChart, originalName, originalKey, targetKey, bpm);
        contentType = 'application/pdf';
        extension = 'pdf';
    } else if (format === 'pro') {
        const chordProText = lineBasedToChordPro(finalChart, originalName, targetKey || originalKey);
        fileBuffer = Buffer.from(chordProText, 'utf-8');
        contentType = 'text/plain';
        extension = 'pro';
    } else {
        fileBuffer = await createDocxChart(finalChart, originalName, originalKey, targetKey, bpm);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        extension = 'docx';
    }

    const safeFilename = `${originalName.replace(/\s+/g, '_')}_Chart.${extension}`;
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(fileBuffer);
    
    console.log(`[API] Successfully delivered: ${safeFilename}`);
}

// --- ROUTE 1: SEARCH ---
app.get('/api/convert', async (req, res) => {
    const query = req.query.q;
    let songKey = req.query.key;
    const targetKey = req.query.targetKey || ''; 
    const format = req.query.format || 'docx';
    const simplify = req.query.simplify === 'true';
    const bpm = req.query.bpm || '';

    if (!query) return res.status(400).json({ error: "Please provide a song query." });

    try {
        console.log(`[API] Searching for: ${query}`);
        
        const tabUrl = await getFirstSearchResult(query); 
        const html = await fetchUGPage(tabUrl);
        const tabData = extractTabData(html);
        
        if (!songKey) songKey = tabData.songKey;

        if (!songKey) {
            return res.status(400).json({ error: "No key found on UG. Please provide a manual key.", needsManualKey: true });
        }

        console.log(`[API] Transposing chart...`);
        const finalChart = processAndAlignTabs(tabData.rawTabText, songKey, targetKey, false, simplify);
        
        await deliverFile(res, finalChart, query, songKey, targetKey, format, bpm);

    } catch (error) {
        console.error(`[API Error]`, error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 4: BATCH SETLIST BINDER EXPORT ---
app.post('/api/binder', async (req, res) => {
    const { setlist, format, bpm } = req.body; 
    if (!setlist || setlist.length === 0) return res.status(400).json({ error: "Setlist is empty." });

    try {
        let combinedText = "";
        for (let i = 0; i < setlist.length; i++) {
            const song = setlist[i];
            if (i > 0) combinedText += `\n\n\n\n\n`; 
            combinedText += `=== SONG ${i + 1}: ${song.title.toUpperCase()} ===\n`;
            let keyText = song.targetKey;
            if (song.bpm) {
                keyText += ` | BPM: ${song.bpm}`;
            }
            combinedText += `Key: ${keyText}\n\n`;
            combinedText += song.text;
        }
        await deliverFile(res, combinedText, "Setlist_Binder", "Mixed", "Mixed", format, bpm);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 3: RAW TEXT GENERATOR FOR EDITOR ---
app.get('/api/preview', async (req, res) => {
    const { q: query, key: songKey, targetKey, simplify } = req.query;
    try {
        const tabUrl = await getFirstSearchResult(query); 
        const html = await fetchUGPage(tabUrl);
        const tabData = extractTabData(html);
        
        const finalKey = songKey || tabData.songKey;
        if (!finalKey) return res.status(400).json({ error: "No key found." });

        const isSimplify = simplify === 'true';
        const finalChart = processAndAlignTabs(tabData.rawTabText, finalKey, targetKey || '', false, isSimplify);
        
        res.json({ title: query, originalKey: finalKey, targetKey: targetKey || 'Nashville', text: finalChart });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 2: UPLOAD ---
app.post('/api/import', upload.single('chartFile'), async (req, res) => {
    const songKey = req.body.key;
    const targetKey = req.body.targetKey || ''; 
    const file = req.file;
    const format = req.body.format || 'docx';
    const simplify = req.body.simplify === 'true';
    const bpm = req.body.bpm || '';

    if (!file) return res.status(400).json({ error: "Please upload a .txt, .docx, .pdf, .pro, or .cho file." });

    try {
        console.log(`[API] Processing upload: ${file.originalname}`);
        let extractedText = "";
        let isPdf = false;
        let originalName = file.originalname.replace(/\.[^/.]+$/, ""); 
        let detectedKey = "";

        const lowerName = file.originalname.toLowerCase();
        const isChordPro = lowerName.endsWith('.pro') || lowerName.endsWith('.cho');

        // --- Multi-Format Extraction Logic ---
        if (isChordPro || file.mimetype === 'text/plain') {
            const rawText = file.buffer.toString('utf-8');
            if (isChordPro || rawText.includes('{title:') || rawText.includes('{t:') || (rawText.includes('[') && rawText.includes(']'))) {
                const parsed = chordProToLineBased(rawText);
                extractedText = parsed.text;
                detectedKey = parsed.key;
                if (parsed.title && parsed.title !== 'Untitled') {
                    originalName = parsed.title;
                }
            } else {
                extractedText = rawText;
            }
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            extractedText = result.value;
        } else if (file.mimetype === 'application/pdf') {
            const pdfData = await pdfParse(file.buffer);
            extractedText = pdfData.text;
            isPdf = true;
        } else {
            return res.status(400).json({ error: "Unsupported file type. Use .txt, .docx, .pdf, .pro, or .cho" });
        }

        const finalSongKey = songKey || detectedKey;
        if (!finalSongKey || finalSongKey === 'auto' || finalSongKey === 'nashville') {
            // Keep Nashville as a valid key string, but throw if no key is supplied
            if (!finalSongKey) {
                return res.status(400).json({ error: "Could not auto-detect original key from file directives. Please select it manually.", needsManualKey: true });
            }
        }

        console.log(`[API] Transposing uploaded chart...`);
        const finalChart = processAndAlignTabs(extractedText, finalSongKey, targetKey, isPdf, simplify);
        
        await deliverFile(res, finalChart, originalName, finalSongKey, targetKey, format, bpm);

    } catch (error) {
        console.error(`[API Error]`, error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 5: UPLOAD PREVIEW (JSON) ---
app.post('/api/import-preview', upload.single('chartFile'), async (req, res) => {
    const songKey = req.body.key;
    const file = req.file;
    const targetKey = req.body.targetKey || ''; 
    const simplify = req.body.simplify === 'true';

    if (!file) return res.status(400).json({ error: "Please upload a file." });

    try {
        let extractedText = "";
        let isPdf = false;
        let originalName = file.originalname.replace(/\.[^/.]+$/, ""); 
        let detectedKey = "";

        const lowerName = file.originalname.toLowerCase();
        const isChordPro = lowerName.endsWith('.pro') || lowerName.endsWith('.cho');

        // --- Multi-Format Extraction Logic ---
        if (isChordPro || file.mimetype === 'text/plain') {
            const rawText = file.buffer.toString('utf-8');
            if (isChordPro || rawText.includes('{title:') || rawText.includes('{t:') || (rawText.includes('[') && rawText.includes(']'))) {
                const parsed = chordProToLineBased(rawText);
                extractedText = parsed.text;
                detectedKey = parsed.key;
                if (parsed.title && parsed.title !== 'Untitled') {
                    originalName = parsed.title;
                }
            } else {
                extractedText = rawText;
            }
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            extractedText = result.value;
        } else if (file.mimetype === 'application/pdf') {
            const pdfData = await pdfParse(file.buffer);
            extractedText = pdfData.text;
            isPdf = true;
        } else {
            return res.status(400).json({ error: "Unsupported file type. Use .txt, .docx, .pdf, .pro, or .cho" });
        }

        const finalSongKey = songKey || detectedKey;
        if (!finalSongKey || finalSongKey === 'auto') {
            return res.status(400).json({ error: "Could not auto-detect original key from file directives. Please select it manually.", needsManualKey: true });
        }

        console.log(`[API] Previewing uploaded chart...`);
        const finalChart = processAndAlignTabs(extractedText, finalSongKey, targetKey, isPdf, simplify);

        res.json({
            title: originalName,
            originalKey: finalSongKey,
            targetKey: targetKey || 'Nashville',
            text: finalChart
        });

    } catch (error) {
        console.error(`[API Error]`, error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎸 Nashville Engine API is running on port ${PORT}`);
});