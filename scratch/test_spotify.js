const fs = require('fs');
const path = require('path');

// Manually load .env variables
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
            process.env[parts[0].trim()] = parts[1].trim();
        }
    });
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

console.log('--- Spotify Integration Tester ---');
console.log('SPOTIFY_CLIENT_ID:', clientId ? 'Found' : 'Missing');
console.log('SPOTIFY_CLIENT_SECRET:', clientSecret ? 'Found' : 'Missing');

if (!clientId || !clientSecret) {
    console.error('Error: Credentials not found.');
    process.exit(1);
}

async function getSpotifyToken() {
    try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Spotify Auth failed: ${res.statusText} - ${errBody}`);
        }

        const data = await res.json();
        return data.access_token;
    } catch (e) {
        console.error("[Spotify Error] Auth failed:", e.message);
        return null;
    }
}

async function getSpotifyTrackMetadata(query) {
    const token = await getSpotifyToken();
    if (!token) {
        console.error("Could not obtain Spotify access token.");
        return null;
    }

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
        const bpm = Math.round(featuresData.tempo || 0);
        const timeSignature = featuresData.time_signature || 4;
        const keyVal = featuresData.key;
        let detectedKey = '';

        if (keyVal !== undefined && keyVal !== -1) {
            const spotifyKeys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
            detectedKey = spotifyKeys[keyVal];
        }

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

// Run test on "Hotel California"
getSpotifyTrackMetadata("Hotel California Eagles").then(meta => {
    console.log('Result:', meta);
    if (meta && meta.spotifyKey === 'B' && meta.bpm) {
        console.log('SUCCESS: Spotify integration is working perfectly!');
    } else {
        console.log('FAILURE: Could not verify metadata.');
    }
});
