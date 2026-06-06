const express = require('express');
const path = require('path');
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
    lineBasedToChordPro,
    getPlayKey,
    getChordSvg,
    getKeyCircleCoordinate,
    getCircleOfFifthsDistance,
    getTranspositionRemedies
} = require('./engine'); 

// --- SPOTIFY WEB API INTEGRATION ---
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        console.warn("[Spotify] SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not configured. Spotify API features will be bypassed.");
        return null;
    }
    
    if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
        return spotifyAccessToken;
    }
    
    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Spotify Auth failed: ${res.statusText} - ${errBody}`);
        }
        
        const data = await res.json();
        spotifyAccessToken = data.access_token;
        spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        console.log("[Spotify] Successfully retrieved new Access Token");
        return spotifyAccessToken;
    } catch (e) {
        console.error("[Spotify Error] Auth failed:", e.message);
        return null;
    }
}

async function getSpotifyTrackMetadata(query) {
    const token = await getSpotifyToken();
    if (!token) return null;
    
    try {
        console.log(`[Spotify] Searching track for query: "${query}"`);
        const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!searchRes.ok) {
            console.error(`[Spotify Error] Search failed: ${searchRes.statusText}`);
            return null;
        }
        
        const searchData = await searchRes.json();
        const track = searchData.tracks?.items?.[0];
        if (!track) {
            console.log(`[Spotify] No track found for: "${query}"`);
            return null;
        }
        
        const trackId = track.id;
        console.log(`[Spotify] Found track ID: ${trackId} (${track.name} by ${track.artists?.[0]?.name})`);
        
        const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!featuresRes.ok) {
            console.error(`[Spotify Error] Audio features fetch failed: ${featuresRes.statusText}`);
            return null;
        }
        
        const featuresData = await featuresRes.json();
        
        const spotifyKeys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const keyVal = featuresData.key;
        const modeVal = featuresData.mode;
        
        let detectedKey = '';
        if (keyVal >= 0 && keyVal < 12) {
            detectedKey = spotifyKeys[keyVal];
            if (modeVal === 0) {
                detectedKey += 'm';
            }
        }
        
        const bpm = Math.round(featuresData.tempo);
        const timeSignature = featuresData.time_signature;
        
        console.log(`[Spotify] Metadata retrieved: BPM=${bpm}, TimeSignature=${timeSignature}, Key=${detectedKey}`);
        return {
            bpm,
            timeSignature,
            spotifyKey: detectedKey
        };
    } catch (e) {
        console.error("[Spotify Error] Metadata retrieval failed:", e.message);
        return null;
    }
} 

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const upload = multer({ storage: multer.memoryStorage() });

async function deliverFile(res, finalChart, originalName, originalKey, targetKey, format, bpm, capo = 0, timeSignature = '', columns = '1', voicing = 'guitar') {
    let fileBuffer;
    let contentType;
    let extension;

    if (format === 'pdf') {
        const rawPdf = await createPdfChart(finalChart, originalName, originalKey, targetKey, bpm, capo, timeSignature, columns, voicing);
        fileBuffer = Buffer.from(rawPdf);
        contentType = 'application/pdf';
        extension = 'pdf';
    } else if (format === 'pro') {
        const chordProText = lineBasedToChordPro(finalChart, originalName, targetKey || originalKey);
        fileBuffer = Buffer.from(chordProText, 'utf-8');
        contentType = 'text/plain';
        extension = 'pro';
    } else {
        const rawDocx = await createDocxChart(finalChart, originalName, originalKey, targetKey, bpm, capo, timeSignature, columns);
        fileBuffer = Buffer.from(rawDocx);
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
    if (songKey === 'nashville') songKey = '';
    const targetKey = req.query.targetKey || ''; 
    const format = req.query.format || 'docx';
    const simplify = req.query.simplify === 'true';
    const bpm = req.query.bpm || '';
    const capo = parseInt(req.query.capo, 10) || 0;
    const timeSignature = req.query.timeSignature || '';
    const columns = req.query.columns || '1';
    const voicing = req.query.voicing || 'guitar';

    if (!query) return res.status(400).json({ error: "Please provide a song query." });

    try {
        console.log(`[API] Searching for: ${query}`);
        
        let tabUrl;
        if (typeof query === 'string' && /tabs\.ultimate-guitar\.com/i.test(query)) {
            tabUrl = query.trim();
            if (!/^https?:\/\//i.test(tabUrl)) {
                tabUrl = 'https://' + tabUrl;
            }
            console.log(`[API] Skipping search for direct Ultimate Guitar URL: ${tabUrl}`);
        } else {
            tabUrl = await getFirstSearchResult(query);
        }
        const html = await fetchUGPage(tabUrl);
        const tabData = extractTabData(html);
        
        let spotifyMeta = null;
        if (!songKey || !bpm || !timeSignature) {
            spotifyMeta = await getSpotifyTrackMetadata(query);
        }

        if (!songKey) songKey = tabData.songKey || (spotifyMeta ? spotifyMeta.spotifyKey : null);

        if (!songKey) {
            return res.status(400).json({ error: "No key found on UG. Please provide a manual key.", needsManualKey: true });
        }

        const finalBpm = bpm || (spotifyMeta ? spotifyMeta.bpm : '');
        const finalTimeSig = timeSignature || (spotifyMeta ? spotifyMeta.timeSignature : '');

        console.log(`[API] Transposing chart...`);
        const finalChart = processAndAlignTabs(tabData.rawTabText, songKey, targetKey, false, simplify, capo);
        
        await deliverFile(res, finalChart, query, songKey, targetKey, format, finalBpm, capo, finalTimeSig, columns, voicing);

    } catch (error) {
        console.error(`[API Error]`, error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 4: BATCH SETLIST BINDER EXPORT ---
app.post('/api/binder', async (req, res) => {
    const { setlist, format, bpm, timeSignature, columns, title, voicing } = req.body;
    if (!setlist || setlist.length === 0) return res.status(400).json({ error: "Setlist is empty." });

    try {
        if (setlist.length === 1 && (!title || !title.trim())) {
            const song = setlist[0];
            return await deliverFile(
                res,
                song.text,
                song.title,
                song.originalKey,
                song.targetKey,
                format,
                song.bpm || bpm,
                parseInt(song.capo, 10) || 0,
                song.timeSignature || timeSignature || '',
                columns || '1',
                voicing || 'guitar'
            );
        }

        let combinedText = "";
        for (let i = 0; i < setlist.length; i++) {
            const song = setlist[i];
            if (i > 0) combinedText += `\n\n\n\n\n`; 
            combinedText += `=== SONG ${i + 1}: ${song.title.toUpperCase()} ===\n`;
            
            let keyText = song.targetKey;
            const isTargetNashville = !song.targetKey || /^nashville$|^1$/i.test(song.targetKey.trim());
            const isSourceNashville = !song.originalKey || /^nashville$/i.test(song.originalKey.trim());
            const capoVal = parseInt(song.capo, 10);
            
            if (!isTargetNashville && !isSourceNashville) {
                keyText = `${song.targetKey}`;
                if (song.originalKey && song.originalKey !== song.targetKey) {
                    keyText += ` (Original: ${song.originalKey})`;
                }
                if (capoVal && capoVal > 0) {
                    const playKey = getPlayKey(song.targetKey, capoVal);
                    keyText += ` | Capo: ${capoVal} | Play: ${playKey}`;
                }
            } else if (isTargetNashville) {
                keyText = isSourceNashville ? 'Nashville Numbers' : `${song.originalKey}`;
            }

            if (song.bpm) {
                keyText += ` | BPM: ${song.bpm}`;
            }
            if (song.timeSignature) {
                let formattedTimeSig = song.timeSignature;
                if (!isNaN(Number(song.timeSignature))) {
                    const num = Number(song.timeSignature);
                    if (num === 4) formattedTimeSig = '4/4';
                    else if (num === 3) formattedTimeSig = '3/4';
                    else if (num === 2) formattedTimeSig = '2/4';
                    else if (num === 6) formattedTimeSig = '6/8';
                    else formattedTimeSig = `${num}/4`;
                }
                keyText += ` | Time Sig: ${formattedTimeSig}`;
            }
            combinedText += `Key: ${keyText}\n\n`;
            combinedText += song.text;
        }
        await deliverFile(res, combinedText, title || "Setlist Binder", "Mixed", "Mixed", format, bpm, 0, timeSignature || '', columns || '1', voicing || 'guitar');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- NEW ROUTE: DIRECT CHORD CHART TRANSPOSITION ---
app.post('/api/transpose', (req, res) => {
    const { text, originalKey, targetKey, capo, simplify } = req.body;
    if (!text || !originalKey) {
        return res.status(400).json({ error: "Missing text or originalKey" });
    }
    try {
        const finalChart = processAndAlignTabs(text, originalKey, targetKey || '', false, simplify === true, parseInt(capo, 10) || 0);
        res.json({ text: finalChart });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- NEW ROUTE: CIRCLE OF FIFTHS TRANSITION DISTANCE & REMEDIES ---
app.get('/api/transition-remedies', (req, res) => {
    const { key1, key2 } = req.query;
    if (!key1 || !key2) {
        return res.status(400).json({ error: "Missing key1 or key2 query parameters" });
    }
    try {
        const distance = getCircleOfFifthsDistance(key1, key2);
        const remedies = getTranspositionRemedies(key1, key2);
        res.json({ distance, remedies });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 3: RAW TEXT GENERATOR FOR EDITOR ---
app.get('/api/preview', async (req, res) => {
    let { q: query, key: songKey, targetKey, simplify, capo: capoParam } = req.query;
    if (songKey === 'nashville') songKey = '';
    try {
        let tabUrl;
        if (typeof query === 'string' && /tabs\.ultimate-guitar\.com/i.test(query)) {
            tabUrl = query.trim();
            if (!/^https?:\/\//i.test(tabUrl)) {
                tabUrl = 'https://' + tabUrl;
            }
            console.log(`[API] Skipping search for direct Ultimate Guitar URL: ${tabUrl}`);
        } else {
            tabUrl = await getFirstSearchResult(query);
        }
        const html = await fetchUGPage(tabUrl);
        const tabData = extractTabData(html);
        
        let spotifyMeta = null;
        try {
            spotifyMeta = await getSpotifyTrackMetadata(query);
        } catch (e) {
            console.log(`[Spotify] Preview metadata fetch failed: ${e.message}`);
        }

        const finalKey = songKey || tabData.songKey || (spotifyMeta ? spotifyMeta.spotifyKey : null);
        if (!finalKey) return res.status(400).json({ error: "No key found." });

        const isSimplify = simplify === 'true';
        const capo = parseInt(capoParam, 10) || 0;
        const finalChart = processAndAlignTabs(tabData.rawTabText, finalKey, targetKey || '', false, isSimplify, capo);
        const playKey = capo > 0 ? getPlayKey(targetKey || finalKey, capo) : '';
        
        res.json({ 
            title: query, 
            originalKey: finalKey, 
            targetKey: targetKey || 'Nashville', 
            text: finalChart, 
            originalText: tabData.rawTabText,
            capo: capo, 
            playKey: playKey,
            bpm: spotifyMeta ? spotifyMeta.bpm : '',
            timeSignature: spotifyMeta ? spotifyMeta.timeSignature : '',
            spotifyKey: spotifyMeta ? spotifyMeta.spotifyKey : ''
        });
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
    const capo = parseInt(req.body.capo, 10) || 0;
    const timeSignature = req.body.timeSignature || '';
    const columns = req.body.columns || '1';
    const voicing = req.body.voicing || 'guitar';

    if (!file) return res.status(400).json({ error: "Please upload a .txt, .docx, .pdf, .pro, or .cho" });

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

        let spotifyMeta = null;
        if (!songKey || !bpm || !timeSignature) {
            try {
                spotifyMeta = await getSpotifyTrackMetadata(originalName);
            } catch (e) {
                console.log(`[Spotify] Upload metadata retrieval failed: ${e.message}`);
            }
        }

        const finalSongKey = songKey || detectedKey || (spotifyMeta ? spotifyMeta.spotifyKey : null);
        if (!finalSongKey || finalSongKey === 'auto' || finalSongKey === 'nashville') {
            if (!finalSongKey) {
                return res.status(400).json({ error: "Could not auto-detect original key from file directives. Please select it manually.", needsManualKey: true });
            }
        }

        const finalBpm = bpm || (spotifyMeta ? spotifyMeta.bpm : '');
        const finalTimeSig = timeSignature || (spotifyMeta ? spotifyMeta.timeSignature : '');

        console.log(`[API] Transposing uploaded chart...`);
        const finalChart = processAndAlignTabs(extractedText, finalSongKey, targetKey, isPdf, simplify, capo);
        
        await deliverFile(res, finalChart, originalName, finalSongKey, targetKey, format, finalBpm, capo, finalTimeSig, columns, voicing);

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
    const capo = parseInt(req.body.capo, 10) || 0;

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

        let spotifyMeta = null;
        try {
            spotifyMeta = await getSpotifyTrackMetadata(originalName);
        } catch (e) {
            console.log(`[Spotify] Upload preview metadata retrieval failed: ${e.message}`);
        }

        const finalSongKey = songKey || detectedKey || (spotifyMeta ? spotifyMeta.spotifyKey : null);
        if (!finalSongKey || finalSongKey === 'auto') {
            return res.status(400).json({ error: "Could not auto-detect original key from file directives. Please select it manually.", needsManualKey: true });
        }

        console.log(`[API] Previewing uploaded chart...`);
        const finalChart = processAndAlignTabs(extractedText, finalSongKey, targetKey, isPdf, simplify, capo);
        const playKey = capo > 0 ? getPlayKey(targetKey || finalSongKey, capo) : '';

        res.json({
            title: originalName,
            originalKey: finalSongKey,
            targetKey: targetKey || 'Nashville',
            text: finalChart,
            originalText: extractedText,
            capo: capo,
            playKey: playKey,
            bpm: spotifyMeta ? spotifyMeta.bpm : '',
            timeSignature: spotifyMeta ? spotifyMeta.timeSignature : '',
            spotifyKey: spotifyMeta ? spotifyMeta.spotifyKey : ''
        });

    } catch (error) {
        console.error(`[API Error]`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- ROUTE 6: CHORD SVG GENERATOR ---
app.get('/api/chord-svg', (req, res) => {
    const chord = req.query.chord;
    const voicing = req.query.voicing || 'guitar';
    if (!chord) {
        return res.status(400).send('Please provide a chord query parameter.');
    }
    try {
        const svg = getChordSvg(chord, voicing);
        if (!svg) {
            return res.status(404).send('Chord not found');
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (error) {
        console.error(`[API Error] chord-svg:`, error.message);
        res.status(500).send(error.message);
    }
});

// --- ROUTE 7: SPOTIFY PLAYLIST IMPORT ---
app.post('/api/spotify/playlist-import', async (req, res) => {
    let playlistId = req.body.playlistId;
    const playlistUrl = req.body.playlistUrl;
    
    // Support parsing ID from playlist URL or URI
    if (playlistUrl) {
        const urlMatch = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
        const uriMatch = playlistUrl.match(/spotify:playlist:([a-zA-Z0-9]+)/);
        if (urlMatch) {
            playlistId = urlMatch[1];
        } else if (uriMatch) {
            playlistId = uriMatch[1];
        } else if (!playlistId) {
            playlistId = playlistUrl;
        }
    }
    
    if (!playlistId) {
        return res.status(400).json({ error: "Please provide a valid Spotify playlistId or playlistUrl in the request body." });
    }
    
    // Pagination parameters - support up to 15 tracks per request
    const limit = Math.min(parseInt(req.body.limit || req.query.limit || 15, 10), 15);
    const offset = Math.max(parseInt(req.body.offset || req.query.offset || 0, 10), 0);
    
    const token = await getSpotifyToken();
    if (!token) {
        return res.status(401).json({
            error: "Spotify API client credentials not configured. Please check server environment or configure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
        });
    }
    
    try {
        console.log(`[Spotify] Fetching playlist tracks for ID: ${playlistId}, limit: ${limit}, offset: ${offset}`);
        
        const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!playlistRes.ok) {
            const errText = await playlistRes.text();
            console.error(`[Spotify Error] Playlist tracks fetch failed (Status ${playlistRes.status}): ${errText}`);
            return res.status(playlistRes.status).json({
                error: `Failed to fetch Spotify playlist: ${playlistRes.statusText}`,
                details: errText
            });
        }
        
        const playlistData = await playlistRes.json();
        const items = playlistData.items || [];
        
        const tracks = items
            .filter(item => item && item.track)
            .map(item => item.track);
            
        const trackIds = tracks.map(t => t.id).filter(id => id).join(',');
        
        let audioFeatures = [];
        if (trackIds) {
            const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (featuresRes.ok) {
                const featuresData = await featuresRes.json();
                audioFeatures = featuresData.audio_features || [];
            } else {
                console.warn(`[Spotify Warning] Failed to fetch audio features: ${featuresRes.statusText}`);
            }
        }
        
        const featuresMap = {};
        audioFeatures.forEach(feat => {
            if (feat && feat.id) {
                featuresMap[feat.id] = feat;
            }
        });
        
        const spotifyKeys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        
        function formatDuration(ms) {
            if (typeof ms !== 'number') return '0:00';
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        const formattedTracks = tracks.map(track => {
            const features = featuresMap[track.id] || null;
            let detectedKey = '';
            let bpm = null;
            let timeSignature = null;
            
            if (features) {
                const keyVal = features.key;
                const modeVal = features.mode;
                if (keyVal >= 0 && keyVal < 12) {
                    detectedKey = spotifyKeys[keyVal];
                    if (modeVal === 0) {
                        detectedKey += 'm';
                    }
                }
                bpm = Math.round(features.tempo);
                timeSignature = features.time_signature;
            }
            
            return {
                title: track.name,
                artist: track.artists ? track.artists.map(a => a.name).join(', ') : '',
                artists: track.artists ? track.artists.map(a => a.name) : [],
                originalKey: detectedKey || null,
                durationMs: track.duration_ms,
                durationFormatted: formatDuration(track.duration_ms),
                bpm,
                timeSignature,
                spotifyId: track.id
            };
        });
        
        res.json({
            tracks: formattedTracks,
            pagination: {
                total: playlistData.total,
                limit,
                offset,
                hasNext: offset + limit < playlistData.total,
                hasPrevious: offset > 0
            }
        });
        
    } catch (error) {
        console.error(`[Spotify Error] Playlist import failed:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎸 Nashville Engine API is running on port ${PORT}`);
});
