const assert = require('assert');
// Set a custom port
process.env.PORT = '3333';

// 1. Intercept Express application creation to capture the server instance
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

// 2. Mock engine before requiring server
const engine = require('../backend/engine');

// Keep track of what was called
let fetchUGPageCalledWith = null;
let getFirstSearchResultCalledWith = null;

const originalFetchUGPage = engine.fetchUGPage;
engine.fetchUGPage = async (url) => {
    fetchUGPageCalledWith = url;
    return `<html>
        <span>Key:</span><span>C</span>
        <pre>
[Intro]
C\tG\tAm\tF

[Verse]
C\t\tG\t\tAm\t\tF
Here is some lyrics.
</pre>
    </html>`;
};

const originalGetFirstSearchResult = engine.getFirstSearchResult;
engine.getFirstSearchResult = async (query) => {
    getFirstSearchResultCalledWith = query;
    return "https://tabs.ultimate-guitar.com/tab/mocked-artist/mocked-song-chords-12345";
};

// 2. Start server
console.log("Starting server in-process...");
require('../backend/server');

// Helper to make fetch request
async function makeRequest(path) {
    const res = await fetch(`http://localhost:3333${path}`);
    if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

(async () => {
    try {
        console.log("🎸 STARTING SERVER ENDPOINTS INTEGRATION TEST\n");

        // Test 1: GET /api/preview with a normal query
        console.log("Running Test 1: GET /api/preview with normal query");
        fetchUGPageCalledWith = null;
        getFirstSearchResultCalledWith = null;
        
        let data1 = await makeRequest("/api/preview?q=Oasis%20Wonderwall&key=G&targetKey=G");
        assert.strictEqual(getFirstSearchResultCalledWith, "Oasis Wonderwall");
        assert.strictEqual(fetchUGPageCalledWith, "https://tabs.ultimate-guitar.com/tab/mocked-artist/mocked-song-chords-12345");
        // Verify originalText exists and has the un-transposed raw pre text
        assert.ok(data1.originalText);
        assert.ok(data1.originalText.includes("C\tG\tAm\tF"));
        // Verify output text exists, and should have tabs replaced with 4 spaces
        assert.ok(data1.text);
        assert.ok(data1.text.includes("C    G    Am    F"));
        console.log("✅ Passed: Normal query preview & originalText extraction");

        // Test 2: GET /api/preview with a direct Ultimate Guitar URL
        console.log("\nRunning Test 2: GET /api/preview with direct UG URL");
        fetchUGPageCalledWith = null;
        getFirstSearchResultCalledWith = null;

        let data2 = await makeRequest("/api/preview?q=tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-3913&key=G&targetKey=G");
        // Verify getFirstSearchResult was NOT called since search was bypassed
        assert.strictEqual(getFirstSearchResultCalledWith, null);
        // Verify fetchUGPage was called directly with formatted URL
        assert.strictEqual(fetchUGPageCalledWith, "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-3913");
        assert.ok(data2.originalText);
        console.log("✅ Passed: Direct URL bypass for preview");

        // Test 3: POST /api/import-preview
        console.log("\nRunning Test 3: POST /api/import-preview with mock file");
        
        const formData = new FormData();
        const fileContent = "[Intro]\nC\tG\tAm\tF\nSome lyrics";
        const fileBlob = new Blob([fileContent], { type: 'text/plain' });
        formData.append('chartFile', fileBlob, 'mock_song.txt');
        formData.append('key', 'C');
        formData.append('targetKey', 'C');

        const postRes = await fetch("http://localhost:3333/api/import-preview", {
            method: 'POST',
            body: formData
        });
        assert.strictEqual(postRes.status, 200);
        const data3 = await postRes.json();
        assert.strictEqual(data3.originalText, "Intro\nC\tG\tAm\tF\nSome lyrics");
        // The text property should be cleaned/processed
        assert.strictEqual(data3.text, "Intro\nC    G    Am    F\nSome lyrics");
        console.log("✅ Passed: Import preview contains originalText and cleaned text");

        console.log("\n✨ ALL SERVER ENDPOINTS TESTS PASSED!");
        if (serverInstance) {
            serverInstance.close();
        }
        setTimeout(() => {
            process.exit(0);
        }, 100);
    } catch (e) {
        console.error("❌ Integration Test Failed:");
        console.error(e);
        if (serverInstance) {
            serverInstance.close(() => {
                process.exit(1);
            });
        } else {
            process.exit(1);
        }
    }
})();
