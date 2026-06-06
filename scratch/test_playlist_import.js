const assert = require('assert');
const path = require('path');

// Save the original fetch to make requests to our local test server
const originalFetch = globalThis.fetch;

// Define test configuration
process.env.PORT = 9999;
process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

// State to control mock behavior
let mockTokenSuccess = true;
let mockPlaylistSuccess = true;
let mockAudioFeaturesSuccess = true;
let lastPlaylistFetchedId = null;
let lastPlaylistLimit = null;
let lastPlaylistOffset = null;

// Setup global mock fetch
globalThis.fetch = async (url, options) => {
    // 1. Spotify Auth Token Endpoint
    if (url.includes('accounts.spotify.com/api/token')) {
        if (!mockTokenSuccess) {
            return {
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: async () => 'Invalid client credentials'
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'mock-access-token-123',
                expires_in: 3600
            })
        };
    }

    // 2. Spotify Playlist Tracks Endpoint
    if (url.includes('api.spotify.com/v1/playlists/')) {
        const idMatch = url.match(/playlists\/([^\/]+)\/tracks/);
        lastPlaylistFetchedId = idMatch ? idMatch[1] : null;

        const urlObj = new URL(url);
        lastPlaylistLimit = urlObj.searchParams.get('limit');
        lastPlaylistOffset = urlObj.searchParams.get('offset');

        if (!mockPlaylistSuccess) {
            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => JSON.stringify({ error: { message: 'Playlist not found.' } })
            };
        }

        // Return a mock playlist with 3 tracks
        return {
            ok: true,
            status: 200,
            json: async () => ({
                items: [
                    {
                        track: {
                            id: 'track1',
                            name: 'Song One',
                            artists: [{ name: 'Artist A' }],
                            duration_ms: 185000
                        }
                    },
                    {
                        track: {
                            id: 'track2',
                            name: 'Song Two',
                            artists: [{ name: 'Artist B' }, { name: 'Artist C' }],
                            duration_ms: 240000
                        }
                    },
                    {
                        track: null // Test filtering out null tracks
                    },
                    {
                        track: {
                            id: 'track3',
                            name: 'Song Three',
                            artists: [{ name: 'Artist D' }],
                            duration_ms: 95000
                        }
                    }
                ],
                total: 25,
                limit: parseInt(lastPlaylistLimit, 10),
                offset: parseInt(lastPlaylistOffset, 10)
            })
        };
    }

    // 3. Spotify Audio Features Endpoint
    if (url.includes('api.spotify.com/v1/audio-features')) {
        if (!mockAudioFeaturesSuccess) {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Error'
            };
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({
                audio_features: [
                    {
                        id: 'track1',
                        key: 0,     // C
                        mode: 1,    // Major
                        tempo: 120.4,
                        time_signature: 4
                    },
                    {
                        id: 'track2',
                        key: 9,     // A
                        mode: 0,    // Minor -> Am
                        tempo: 95.8,
                        time_signature: 3
                    },
                    {
                        id: 'track3',
                        key: -1,    // Unknown
                        mode: 1,
                        tempo: 140,
                        time_signature: 4
                    }
                ]
            })
        };
    }

    // Fallback to original fetch for local server testing
    return originalFetch(url, options);
};

// Intercept Express application creation to capture the server instance
const express = require('express');
const originalCreateApplication = express;
let serverInstance = null;

const mockExpress = function() {
    const app = originalCreateApplication();
    const originalListen = app.listen;
    app.listen = function(...args) {
        serverInstance = originalListen.apply(this, args);
        return serverInstance;
    };
    return app;
};
Object.assign(mockExpress, originalCreateApplication);
require.cache[require.resolve('express')] = {
    id: require.resolve('express'),
    filename: require.resolve('express'),
    loaded: true,
    exports: mockExpress
};

// Start the Express app by requiring server.js
console.log("Loading server.js with mocked Spotify API...");
require('../backend/server.js');

async function runTests() {
    const serverUrl = 'http://localhost:9999/api/spotify/playlist-import';
    
    try {
        console.log("\n--- TEST 1: Successful Playlist Import with parsed URL ---");
        const res1 = await originalFetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlistUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo37nh2?si=abc',
                limit: 10,
                offset: 5
            })
        });
        
        assert.strictEqual(res1.status, 200);
        const data1 = await res1.json();
        
        // Verify URL Parsing
        assert.strictEqual(lastPlaylistFetchedId, '37i9dQZF1DXcBWIGo37nh2');
        assert.strictEqual(lastPlaylistLimit, '10');
        assert.strictEqual(lastPlaylistOffset, '5');
        
        // Verify Tracks Length and Structure
        assert.strictEqual(data1.tracks.length, 3); // 4 items in mock, 1 is null
        
        // Track 1 assertions (C Major, 185000 ms = 3:05)
        const t1 = data1.tracks[0];
        assert.strictEqual(t1.title, 'Song One');
        assert.strictEqual(t1.artist, 'Artist A');
        assert.deepStrictEqual(t1.artists, ['Artist A']);
        assert.strictEqual(t1.originalKey, 'C');
        assert.strictEqual(t1.durationMs, 185000);
        assert.strictEqual(t1.durationFormatted, '3:05');
        assert.strictEqual(t1.bpm, 120);
        assert.strictEqual(t1.timeSignature, 4);
        assert.strictEqual(t1.spotifyId, 'track1');

        // Track 2 assertions (A Minor = Am, 240000 ms = 4:00, multiple artists)
        const t2 = data1.tracks[1];
        assert.strictEqual(t2.title, 'Song Two');
        assert.strictEqual(t2.artist, 'Artist B, Artist C');
        assert.deepStrictEqual(t2.artists, ['Artist B', 'Artist C']);
        assert.strictEqual(t2.originalKey, 'Am');
        assert.strictEqual(t2.durationMs, 240000);
        assert.strictEqual(t2.durationFormatted, '4:00');
        assert.strictEqual(t2.bpm, 96);
        assert.strictEqual(t2.timeSignature, 3);
        
        // Track 3 assertions (Unknown key = null)
        const t3 = data1.tracks[2];
        assert.strictEqual(t3.title, 'Song Three');
        assert.strictEqual(t3.originalKey, null);
        assert.strictEqual(t3.durationFormatted, '1:35');
        
        // Pagination Assertions
        assert.strictEqual(data1.pagination.total, 25);
        assert.strictEqual(data1.pagination.limit, 10);
        assert.strictEqual(data1.pagination.offset, 5);
        assert.strictEqual(data1.pagination.hasNext, true);
        assert.strictEqual(data1.pagination.hasPrevious, true);
        
        console.log("✅ TEST 1 PASSED!");

        console.log("\n--- TEST 2: URI parsing & Limit capping ---");
        const res2 = await originalFetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlistUrl: 'spotify:playlist:5TzP1W3QNVSEWXG4CM9FZ',
                limit: 20, // should be capped at 15
                offset: 0
            })
        });
        
        assert.strictEqual(res2.status, 200);
        const data2 = await res2.json();
        assert.strictEqual(lastPlaylistFetchedId, '5TzP1W3QNVSEWXG4CM9FZ');
        assert.strictEqual(data2.pagination.limit, 15); // limit capped at 15
        assert.strictEqual(data2.pagination.hasPrevious, false);
        
        console.log("✅ TEST 2 PASSED!");

        console.log("\n--- TEST 3: Handling Missing credentials or Auth failure ---");
        mockTokenSuccess = false;
        
        // Temporarily clear environment variables to trigger non-configured state
        const savedId = process.env.SPOTIFY_CLIENT_ID;
        const savedSecret = process.env.SPOTIFY_CLIENT_SECRET;
        delete process.env.SPOTIFY_CLIENT_ID;
        delete process.env.SPOTIFY_CLIENT_SECRET;
        
        const res3a = await originalFetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId: 'test' })
        });
        assert.strictEqual(res3a.status, 401);
        const err3a = await res3a.json();
        assert.match(err3a.error, /not configured/);
        
        // Restore variables but fail token retrieval
        process.env.SPOTIFY_CLIENT_ID = savedId;
        process.env.SPOTIFY_CLIENT_SECRET = savedSecret;
        
        // Fast-forward time to expire the cached token and force a token refresh attempt
        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 1000 * 1000 * 1000;
        
        const res3b = await originalFetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId: 'test' })
        });
        
        // Restore Date.now
        Date.now = originalDateNow;
        
        // Since we mocked getSpotifyToken, it logs an error and returns null on throw/failure
        assert.strictEqual(res3b.status, 401);
        
        console.log("✅ TEST 3 PASSED!");
        
        // Restore token success
        mockTokenSuccess = true;

        console.log("\n--- TEST 4: Handling Spotify playlist API errors ---");
        mockPlaylistSuccess = false;
        
        const res4 = await originalFetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId: 'invalid-id' })
        });
        assert.strictEqual(res4.status, 404);
        const data4 = await res4.json();
        assert.match(data4.error, /Failed to fetch Spotify playlist/);
        
        console.log("✅ TEST 4 PASSED!");

        console.log("\nAll unit tests passed successfully! 🎉");
        if (serverInstance) {
            serverInstance.close();
        }
        setTimeout(() => {
            process.exit(0);
        }, 100);

    } catch (e) {
        console.error("\n❌ TEST FAILURE:", e);
        if (serverInstance) {
            serverInstance.close();
        }
        setTimeout(() => {
            process.exit(1);
        }, 100);
    }
}

// Allow server 500ms to boot up and listen before starting tests
setTimeout(runTests, 500);
