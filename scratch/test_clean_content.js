const cheerio = require('cheerio');

async function test() {
    const zenrowsKey = process.env.ZENROWS_API_KEY;
    const url = 'https://tabs.ultimate-guitar.com/tab/jess-ray/runaway-chords-2596185';
    const apiGatewayUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(url)}&js_render=false&premium_proxy=true`;
    
    try {
        const res = await fetch(apiGatewayUrl);
        const html = await res.text();
        const $ = cheerio.load(html);
        const storeData = $('.js-store').first().attr('data-content');
        if (!storeData) return;
        const data = JSON.parse(storeData);
        const tabView = data.store?.page?.data?.tab_view;
        if (tabView) {
            console.log('tab_view.meta:', tabView.meta);
            
            // Test content cleaning
            const content = tabView.wiki_tab?.content;
            if (content) {
                const cleanContent = content
                    .replace(/\[ch\]/g, '')
                    .replace(/\[\/ch\]/g, '')
                    .replace(/\[tab\]/g, '')
                    .replace(/\[\/tab\]/g, '');
                console.log('--- CLEAN CONTENT SNIPPET ---');
                console.log(cleanContent.slice(0, 400));
                console.log('-----------------------------');
            }
        }
    } catch (e) {
        console.error(e.message);
    }
}
test();
