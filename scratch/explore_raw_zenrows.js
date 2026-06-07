const cheerio = require('cheerio');

async function test() {
    const zenrowsKey = process.env.ZENROWS_API_KEY;
    const url = 'https://tabs.ultimate-guitar.com/tab/jess-ray/runaway-chords-2596185';
    if (!zenrowsKey) {
        console.error('ZENROWS_API_KEY is not set');
        return;
    }
    const apiGatewayUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(url)}&js_render=false&premium_proxy=true`;
    console.log('Fetching raw server-rendered HTML via ZenRows (js_render=false)...');
    
    try {
        const res = await fetch(apiGatewayUrl);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const html = await res.text();
        console.log('HTML fetched. Length:', html.length);
        
        const $ = cheerio.load(html);
        const storeData = $('.js-store').first().attr('data-content');
        if (!storeData) {
            console.log('No .js-store found in the raw HTML.');
            return;
        }
        
        console.log('Found .js-store! Parsing JSON...');
        const data = JSON.parse(storeData);
        
        // Let's inspect data.store.page.data
        const pageData = data.store?.page?.data;
        if (pageData) {
            console.log('Keys under store.page.data:', Object.keys(pageData));
            if (pageData.tab) {
                console.log('Tab info:');
                console.log(' - ID:', pageData.tab.id);
                console.log(' - Song Name:', pageData.tab.song_name);
                console.log(' - Artist Name:', pageData.tab.artist_name);
                console.log(' - Type:', pageData.tab.type);
                console.log(' - Key:', pageData.tab.meta?.key);
                console.log(' - Meta info keys:', Object.keys(pageData.tab.meta || {}));
            }
            if (pageData.tab_view) {
                console.log('tab_view keys:', Object.keys(pageData.tab_view));
                if (pageData.tab_view.wiki_tab) {
                    const content = pageData.tab_view.wiki_tab.content;
                    console.log('Content exists:', !!content);
                    if (content) {
                        console.log('Content length:', content.length);
                        console.log('Content snippet:\n', content.slice(0, 300));
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
