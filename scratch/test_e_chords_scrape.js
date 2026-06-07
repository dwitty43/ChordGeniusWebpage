const cheerio = require('cheerio');

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
        console.log("HTML fetched. Length:", html.length);
        const $ = cheerio.load(html);
        
        console.log("Page Title:", $('title').text().trim());
        
        // Let's find where the song core/text is
        console.log("Checking pre tags...");
        $('pre').each((i, el) => {
            console.log(i, "ID:", $(el).attr('id'), "Class:", $(el).attr('class'), "Text length:", $(el).text().length);
            if ($(el).text().length > 100) {
                console.log("Snippet:\n", $(el).text().slice(0, 300));
            }
        });
        
        console.log("Checking key selector/info...");
        // Check for any elements containing key information
        $('[class*="key"], [id*="key"]').each((i, el) => {
            console.log(i, el.name, "ID:", $(el).attr('id'), "Class:", $(el).attr('class'), "Text:", $(el).text().trim());
        });
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
