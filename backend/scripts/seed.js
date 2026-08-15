const path = require('path');
const { fork } = require('child_process');

console.log('[SEED DEPRECATION] seed.js is deprecated. Redirecting to seed_db.js...');
fork(path.join(__dirname, 'seed_db.js'));
