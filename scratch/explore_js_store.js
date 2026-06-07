const cheerio = require('cheerio');

async function explore() {
    const url = 'https://tabs.ultimate-guitar.com/tab/jess-ray/runaway-chords-2596185';
    const fs = require('fs');
    const path = require('path');
    try {
        const html = fs.readFileSync(path.join(__dirname, 'ug_runaway.html'), 'utf-8');
        console.log('HTML loaded from local file. Length:', html.length);
        const $ = cheerio.load(html);
        const storeData = $('.js-store').first().attr('data-content');
        if (!storeData) {
            console.log('No .js-store found in the raw HTML.');
            // Check if there is window.UGAPP
            const match = html.match(/window\.UGAPP\.store\.page\s*=\s*([\s\S]*?);/);
            if (match) {
                console.log('Found window.UGAPP.store.page match!');
            } else {
                console.log('No window.UGAPP.store.page found.');
            }
            return;
        }
        console.log('Found .js-store! Parsing JSON...');
        const data = JSON.parse(storeData);
        console.log('JSON Keys:', Object.keys(data));
        if (data.store) {
            console.log('store Keys:', Object.keys(data.store));
            if (data.store.page) {
                console.log('store.page Keys:', Object.keys(data.store.page));
                if (data.store.page.data) {
                    console.log('store.page.data Keys:', Object.keys(data.store.page.data));
                    const tabView = data.store.page.data.tab_view;
                    if (tabView) {
                        console.log('tab_view Keys:', Object.keys(tabView));
                        if (tabView.wiki_tab) {
                            console.log('wiki_tab Keys:', Object.keys(tabView.wiki_tab));
                            console.log('wiki_tab.content length:', tabView.wiki_tab.content ? tabView.wiki_tab.content.length : 'undefined');
                        }
                        if (tabView.meta) {
                            console.log('meta:', tabView.meta);
                        }
                    }
                    const tab = data.store.page.data.tab;
                    if (tab) {
                        console.log('tab:', tab);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
explore();
