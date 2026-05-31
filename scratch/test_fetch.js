const { getFirstSearchResult, fetchUGPage, extractTabData } = require('../engine');

async function run() {
    try {
        console.log('Searching...');
        const url = await getFirstSearchResult("Gravity John Mayer");
        console.log('Found URL:', url);
        console.log('Fetching...');
        const html = await fetchUGPage(url);
        console.log('Extracted...');
        const tabData = extractTabData(html);
        console.log('Key:', tabData.songKey);
        console.log('Chords length:', tabData.rawTabText.length);
        console.log('SUCCESS!');
    } catch (err) {
        console.error('ERROR:', err);
    }
}
run();
