async function run() {
    try {
        console.log('Fetching SVG from API...');
        const res = await fetch('http://localhost:3000/api/chord-svg?chord=Cmaj7');
        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers.get('content-type'));
        const text = await res.text();
        console.log('SVG Preview:', text.slice(0, 150));
    } catch (err) {
        console.error('Error:', err);
    }
}
run();
