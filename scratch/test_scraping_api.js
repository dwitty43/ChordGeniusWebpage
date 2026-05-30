// Run with: node --env-file=.env scratch/test_scraping_api.js
const { getFirstSearchResult, fetchUGPage, extractTabData } = require('../engine');

(async () => {
    console.log("🧪 Starting Scraping API Integration Test...");
    console.log("Environment check:");
    console.log(" - USE_SCRAPING_API:", process.env.USE_SCRAPING_API);
    console.log(" - ZENROWS_API_KEY:", process.env.ZENROWS_API_KEY ? "CONFIGURED" : "MISSING");
    console.log(" - SCRAPINGBEE_API_KEY:", process.env.SCRAPINGBEE_API_KEY ? "CONFIGURED" : "MISSING");

    try {
        const query = "Yellow - Coldplay";
        console.log(`\n1. Searching for chords for: "${query}"...`);
        const tabUrl = await getFirstSearchResult(query);
        console.log(` -> Found Tab URL: ${tabUrl}`);

        if (!tabUrl) {
            console.error(" -> Error: Tab URL was not resolved.");
            return;
        }

        console.log(`\n2. Fetching tab HTML from: ${tabUrl}...`);
        const html = await fetchUGPage(tabUrl);
        console.log(` -> Fetched HTML Length: ${html.length} bytes`);

        console.log(`\n3. Extracting Tab Data...`);
        const tabData = extractTabData(html);
        console.log(` -> Song Original Key detected: ${tabData.songKey}`);
        console.log(` -> First 150 chars of raw chords:`);
        console.log("-----------------------------------------");
        console.log(tabData.rawTabText.slice(0, 150) + "...");
        console.log("-----------------------------------------");
        console.log("\n✅ Integration Test Successful! The Scraping API is fully operational!");

    } catch (error) {
        console.error("\n❌ Test Failed with Error:", error.message);
    }
})();
