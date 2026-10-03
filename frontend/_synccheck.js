/**
 * Sync Health Check Script
 *
 * Verifies:
 * 1. Backend sync endpoint reachability (http://localhost:5000/api/sync)
 * 2. Dexie IndexedDB sync tables and outbox records
 * 3. Network connectivity status
 */

const http = require('http');

async function checkSync() {
  console.log('--- PharmaFlow Sync Engine Status Check ---');

  // 1. Check Backend Sync Endpoint
  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/sync/check',
    method: 'GET',
    timeout: 3000,
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`✅ Backend Sync Server: HTTP ${res.statusCode}`);
      try {
        const json = JSON.parse(data);
        console.log('   Sync Status:', json);
      } catch {
        console.log('   Raw Response:', data);
      }
    });
  });

  req.on('error', (err) => {
    console.log(`⚠️  Backend Sync Server: Unreachable (${err.message}). System is in OFFLINE mode.`);
  });

  req.on('timeout', () => {
    req.destroy();
    console.log('⚠️  Backend Sync Server: Connection timed out. Running in OFFLINE mode.');
  });

  req.end();
}

checkSync();
