#!/usr/bin/env node

/**
 * Platform switcher for environments without symlink support
 * Copies node_modules between platform-specific directories
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const platform = process.argv[2];

const nodeModulesPath = path.join(rootDir, 'node_modules');
const nodeModulesLinux = path.join(rootDir, 'node_modules_linux');
const nodeModulesWin = path.join(rootDir, 'node_modules_win');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  
  // Remove existing destination
  if (fs.existsSync(dest)) {
    console.log(`Removing old ${path.basename(dest)}...`);
    fs.rmSync(dest, { recursive: true });
  }
  
  // Copy directory
  console.log(`Copying ${path.basename(src)} to ${path.basename(dest)}...`);
  fs.cpSync(src, dest, { recursive: true, filter: (src) => {
    // Skip symlinks
    try {
      const stats = fs.lstatSync(src);
      return !stats.isSymbolicLink();
    } catch (e) {
      return false;
    }
  }});
  
  return true;
}

function switchPlatform(targetPlatform) {
  console.log(`Switching to ${targetPlatform} environment...`);
  
  const targetDir = targetPlatform === 'linux' ? nodeModulesLinux : nodeModulesWin;
  
  if (!fs.existsSync(targetDir)) {
    console.error(`Error: ${path.basename(targetDir)} does not exist.`);
    console.error(`Run: npm run install:${targetPlatform === 'linux' ? 'linux' : 'win'}`);
    process.exit(1);
  }
  
  // Backup current node_modules if it exists
  if (fs.existsSync(nodeModulesPath)) {
    const stats = fs.statSync(nodeModulesPath);
    if (stats.isDirectory()) {
      // Determine current platform by checking for platform-specific files
      const electronLinux = path.join(nodeModulesPath, 'electron', 'dist', 'electron');
      const electronWin = path.join(nodeModulesPath, 'electron', 'dist', 'electron.exe');
      
      let currentPlatform = null;
      if (fs.existsSync(electronLinux)) {
        currentPlatform = 'linux';
      } else if (fs.existsSync(electronWin)) {
        currentPlatform = 'win32';
      }
      
      if (currentPlatform && currentPlatform !== targetPlatform) {
        const backupDir = currentPlatform === 'linux' ? nodeModulesLinux : nodeModulesWin;
        copyDir(nodeModulesPath, backupDir);
        console.log(`Backed up ${currentPlatform} node_modules`);
      }
    }
    
    // Remove current node_modules
    fs.rmSync(nodeModulesPath, { recursive: true });
  }
  
  // Copy target platform
  copyDir(targetDir, nodeModulesPath);
  console.log(`Switched to ${targetPlatform} environment successfully!`);
}

if (!platform || (platform !== 'linux' && platform !== 'win32')) {
  console.error('Usage: node switch-platform.js [linux|win32]');
  process.exit(1);
}

switchPlatform(platform);
