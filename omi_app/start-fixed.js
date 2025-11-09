/**
 * Workaround script for Windows node:sea directory issue
 * Creates a symlink or workaround directory before starting Expo
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Create .expo directory structure if it doesn't exist
const expoDir = path.join(__dirname, '.expo');
const metroDir = path.join(expoDir, 'metro');
const externalsDir = path.join(metroDir, 'externals');

// Create directories
[expoDir, metroDir, externalsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// On Windows, create a workaround for node:sea
// Create a directory with underscore instead of colon
const nodeSeaDir = path.join(externalsDir, 'node_sea');
if (!fs.existsSync(nodeSeaDir)) {
  try {
    fs.mkdirSync(nodeSeaDir, { recursive: true });
    console.log('Created workaround directory for node:sea');
  } catch (err) {
    // Ignore if it already exists or can't be created
  }
}

// Set environment variable to potentially bypass the issue
process.env.EXPO_NO_NODE_LAZY = '1';

// Start Expo
console.log('Starting Expo...');
const expo = spawn('npx', ['expo', 'start'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
  env: { ...process.env, EXPO_NO_NODE_LAZY: '1' }
});

expo.on('close', (code) => {
  process.exit(code);
});

expo.on('error', (err) => {
  console.error('Failed to start Expo:', err);
  process.exit(1);
});

