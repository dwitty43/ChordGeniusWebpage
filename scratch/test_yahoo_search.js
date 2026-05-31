const cheerio = require('cheerio');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

async function fastSearchYahoo(query) {
    try {
        console.log("[Engine] Performing fast Yahoo Search fetch...");
        const encodedQuery = encodeURIComponent("site:tabs.ultimate-guitar.com/tab/ chords " + query);
        const url = `https://search.yahoo.com/search?p=${encodedQuery}`;
        const userAgent = USER_AGENTS[0];
        
        const res = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        
        if (!res.ok) {
            console.log(`[Engine] Yahoo Search fetch returned status ${res.status}`);
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
                return false; 
            }
        });
        
        return found;
    } catch (e) {
        console.log(`[Engine] Yahoo Search fast fetch failed: ${e.message}`);
        return null;
    }
}

fastSearchYahoo("Gravity John Mayer").then(url => {
    console.log('Result:', url);
});
