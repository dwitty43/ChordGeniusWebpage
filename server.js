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
    createPdfChart
} = require('./engine'); 

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

async function deliverFile(res, finalChart, originalName, originalKey, targetKey, format) {
    let fileBuffer;
    let contentType;
    let extension;

    if (format === 'pdf') {
        fileBuffer = await createPdfChart(finalChart, originalName, originalKey, targetKey);
        contentType = 'application/pdf';
        extension = 'pdf';
    } else {
        fileBuffer = await createDocxChart(finalChart, originalName, originalKey, targetKey);
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
        const finalChart = processAndAlignTabs(tabData.rawTabText, songKey, targetKey);
        
        await deliverFile(res, finalChart, query, songKey, targetKey, format);

    } catch (error) {
        console.error(`[API Error]`, error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// --- FEATURE 8: RAW TEXT GENERATOR FOR EDITOR ---
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
        
        // Return raw text instead of a file buffer!
        res.json({ title: query, originalKey: finalKey, targetKey: targetKey || 'Nashville', text: finalChart });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- FEATURE 9: BATCH SETLIST BINDER EXPORT ---
app.post('/api/binder', async (req, res) => {
    const { setlist, format } = req.body; 
    // setlist is an array of objects: { title, originalKey, targetKey, text }
    
    if (!setlist || setlist.length === 0) return res.status(400).json({ error: "Setlist is empty." });

    try {
        console.log(`[API] Generating ${format} Binder for ${setlist.length} songs...`);
        
        // Stitch the text together with massive page breaks
        let combinedText = "";
        for (let song of setlist) {
            // Add spacing between songs so Mammoth/Puppeteer forces page breaks
            combinedText += `\n\n\n=== SONG START ===\n${song.title.toUpperCase()}\n`;
            combinedText += `Key: ${song.targetKey}\n\n`;
            combinedText += song.text;
            combinedText += `\n\n\n\n\n`; // Pad the bottom
        }

        // We use the same delivery function, treating the combined text as one massive chart
        await deliverFile(res, combinedText, "Setlist_Binder", "Mixed", "Mixed", format);

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

    if (!file) return res.status(400).json({ error: "Please upload a .txt, .docx, or .pdf file." });
    if (!songKey) return res.status(400).json({ error: "Please provide the original key of the song." });

    try {
        console.log(`[API] Processing upload: ${file.originalname}`);
        let extractedText = "";
        let isPdf = false;

        // --- NEW: Multi-Format Extraction Logic ---
        if (file.mimetype === 'text/plain') {
            extractedText = file.buffer.toString('utf-8');
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            extractedText = result.value;
        } else if (file.mimetype === 'application/pdf') {
            const pdfData = await pdfParse(file.buffer);
            extractedText = pdfData.text;
            isPdf = true;
        } else {
            return res.status(400).json({ error: "Unsupported file type. Use .txt, .docx, or .pdf" });
        }

        const originalName = file.originalname.replace(/\.[^/.]+$/, ""); 
        
        console.log(`[API] Transposing uploaded chart...`);

        const finalChart = processAndAlignTabs(extractedText, songKey, targetKey, isPdf);
        
        await deliverFile(res, finalChart, originalName, songKey, targetKey, format);

    } catch (error) {
        console.error(`[API Error]`, error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎸 Nashville Engine API is running on port ${PORT}`);
});