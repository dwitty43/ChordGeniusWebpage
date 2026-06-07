const { fetchUGPage, extractTabData } = require('../backend/engine');

async function test() {
    const url = 'https://tabs.ultimate-guitar.com/tab/jess-ray/runaway-chords-2596185';
    console.log('Fetching live URL:', url);
    try {
        const html = await fetchUGPage(url);
        console.log('HTML fetched successfully. Length:', html.length);
        const tabData = extractTabData(html);
        console.log('Tab Data Extracted Successfully!');
        console.log('Key:', tabData.songKey);
        console.log('Raw text sample:', tabData.rawTabText.slice(0, 150));
    } catch (err) {
        console.error('Error occurred:', err.message);
        if (err.message.includes('Could not find')) {
            console.log('HTML contains "<pre":', html && html.includes('<pre'));
        }
    }
}
test();
