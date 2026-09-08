const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Ensure single-tier backend & database are started when Metro runs directly
if (!process.env.SINGLE_TIER_RUNNING) {
  process.env.SINGLE_TIER_RUNNING = '1';
  const startScript = path.resolve(__dirname, 'scripts/start-single-tier.js');
  
  const req = http.get('http://localhost:5000/health', (res) => {
    if (res.statusCode !== 200) {
      spawn('node', [startScript, 'backend-only'], { stdio: 'inherit', shell: true });
    }
  });
  req.on('error', () => {
    spawn('node', [startScript, 'backend-only'], { stdio: 'inherit', shell: true });
  });
  req.setTimeout(500, () => req.destroy());
}

const config = getDefaultConfig(__dirname);

module.exports = config;
