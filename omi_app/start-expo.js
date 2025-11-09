/**
 * Wrapper script that patches fs.mkdir before starting Expo
 * Uses npx to start Expo reliably without interfering with module loading
 */

const { spawn } = require('child_process');
const path = require('path');

// Get all arguments except the script name
const args = process.argv.slice(2);

// Get the relative path to the patch file (avoids issues with spaces in absolute paths)
// Use ./patch-expo.js which should work from the project directory
const patchPath = './patch-expo.js';

// Prepare environment variables
const env = {
  ...process.env,
  EXPO_NO_NODE_LAZY: '1'
};

// Set NODE_OPTIONS to preload the patch in child processes
// Using relative path to avoid issues with spaces in absolute paths
const existingNodeOptions = process.env.NODE_OPTIONS || '';
env.NODE_OPTIONS = existingNodeOptions 
  ? `${existingNodeOptions} -r ${patchPath}`
  : `-r ${patchPath}`;

// Use npx to start Expo - this is more reliable than direct CLI path
// npx will find the correct Expo CLI in node_modules
console.log('Starting Expo development server...');
console.log('If you see connection errors, make sure:');
console.log('  - Your device/emulator is on the same network');
console.log('  - Firewall is not blocking port 8081');
console.log('  - Try: npx expo start --tunnel (for remote access)\n');

const expo = spawn('npx', ['expo', 'start', ...args], {
  stdio: 'inherit',
  shell: true, // Use shell on Windows for better compatibility
  cwd: __dirname,
  env: env
});

expo.on('close', (code) => {
  process.exit(code);
});

expo.on('error', (err) => {
  console.error('\nFailed to start Expo:', err.message);
  console.error('\nTroubleshooting tips:');
  console.error('1. Make sure you are in the project directory');
  console.error('2. Try running: npm install');
  console.error('3. Try running: npx expo start --clear');
  console.error('4. Try running: npx expo start --tunnel (for remote devices)');
  console.error('5. Check if port 8081 is available');
  console.error('\nIf the error persists, try running directly:');
  console.error('  npx expo start');
  process.exit(1);
});

