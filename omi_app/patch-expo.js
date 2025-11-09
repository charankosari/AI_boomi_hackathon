/**
 * Patch Expo CLI to fix Windows node:sea directory issue
 * This patches the fs module at the Node.js level using Module._load
 */

const Module = require('module');
const originalLoad = Module._load;

// Intercept module loading to patch fs before any module uses it
Module._load = function(request, parent, isMain) {
  const module = originalLoad.call(this, request, parent, isMain);
  
  // Patch fs module when it's loaded
  if (request === 'fs' || request === 'fs/promises') {
    patchFsModule(module);
  }
  
  return module;
};

function patchFsModule(fsModule) {
  // Patch fs.promises.mkdir
  if (fsModule.promises && fsModule.promises.mkdir) {
    const originalMkdir = fsModule.promises.mkdir;
    fsModule.promises.mkdir = function(path, options) {
      if (typeof path === 'string' && path.includes(':')) {
        const safePath = path.replace(/:/g, '_');
        console.log(`[PATCH] Fixing path: ${path} -> ${safePath}`);
        return originalMkdir.call(this, safePath, options);
      }
      return originalMkdir.call(this, path, options);
    };
  }
  
  // Patch fs.mkdirSync
  if (fsModule.mkdirSync) {
    const originalMkdirSync = fsModule.mkdirSync;
    fsModule.mkdirSync = function(path, options) {
      if (typeof path === 'string' && path.includes(':')) {
        const safePath = path.replace(/:/g, '_');
        console.log(`[PATCH] Fixing path (sync): ${path} -> ${safePath}`);
        return originalMkdirSync.call(this, safePath, options);
      }
      return originalMkdirSync.call(this, path, options);
    };
  }
  
  // Patch fs.mkdir (callback version)
  if (fsModule.mkdir) {
    const originalMkdir = fsModule.mkdir;
    fsModule.mkdir = function(path, options, callback) {
      if (typeof path === 'string' && path.includes(':')) {
        const safePath = path.replace(/:/g, '_');
        console.log(`[PATCH] Fixing path (callback): ${path} -> ${safePath}`);
        if (typeof options === 'function') {
          return originalMkdir.call(this, safePath, undefined, options);
        }
        return originalMkdir.call(this, safePath, options, callback);
      }
      return originalMkdir.call(this, path, options, callback);
    };
  }
}

// Also patch the fs module that's already loaded
const fs = require('fs');
patchFsModule(fs);

// Patch fs/promises if it exists
try {
  const fsPromises = require('fs/promises');
  patchFsModule({ promises: fsPromises });
} catch (e) {
  // Ignore if fs/promises doesn't exist
}

console.log('Expo CLI patched for Windows compatibility');

