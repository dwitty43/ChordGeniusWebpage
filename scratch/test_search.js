const { getFirstSearchResult } = require('../backend/engine');

console.log('Starting search test for "Gravity John Mayer"...');

getFirstSearchResult("Gravity John Mayer")
    .then(url => {
        console.log('SUCCESS! Found URL:', url);
    })
    .catch(err => {
        console.error('FAILURE:', err.message);
    });
