const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function fetchPageViaAPI(targetUrl) {
    const zenrowsKey = process.env.ZENROWS_API_KEY;
    const scrapingbeeKey = process.env.SCRAPINGBEE_API_KEY;
    
    if (scrapingbeeKey) {
        console.log("[Test] Fetching via ScrapingBee...");
        const apiGatewayUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingbeeKey}&url=${encodeURIComponent(targetUrl)}&render_js=true&premium_proxy=true`;
        const res = await fetch(apiGatewayUrl);
        if (res.ok) return await res.text();
    }
    
    if (zenrowsKey) {
        console.log("[Test] Fetching via ZenRows...");
        const apiGatewayUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(targetUrl)}&js_render=true&premium_proxy=true`;
        const res = await fetch(apiGatewayUrl);
        if (res.ok) return await res.text();
    }
    
    throw new Error("No API key or request failed.");
}

async function run() {
    const url = 'https://www.e-chords.com/chords/coldplay/yellow';
    try {
        const html = await fetchPageViaAPI(url);
        fs.writeFileSync(path.join(__dirname, 'echords_yellow.html'), html);
        console.log("HTML saved. Length:", html.length);
        const $ = cheerio.load(html);
        
        // Search for container containing the lyrics "Look at the stars"
        console.log("Searching for elements containing 'Look at the stars'...");
        $('*').each((i, el) => {
            const text = $(el).text();
            if (text.includes('Look at the stars') && text.length < 20000) {
                console.log(i, el.name, "ID:", $(el).attr('id'), "Class:", $(el).attr('class'), "Length:", text.length);
            }
        });
        
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
