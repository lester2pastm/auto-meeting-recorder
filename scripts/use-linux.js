#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeModules = path.join(rootDir, 'node_modules');
const nodeModulesLinux = path.join(rootDir, 'node_modules_linux');
const nodeModulesWin = path.join(rootDir, 'node_modules_win');

console.log('Switching to Linux environment...');

// Check if already on Linux
if (fs.existsSync(nodeModulesLinux)) {
  const stats = fs.statSync(nodeModulesLinux);
  if (!stats.isDirectory()) {
    console.log('Already on Linux environment.');
    process.exit(0);
  }
}

// Backup current if it exists and is not already backed up
if (fs.existsSync(nodeModules)) {
  const electronWin = path.join(nodeModules, 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(electronWin)) {
    // It's Windows, backup it
    console.log('Backing up Windows node_modules...');
    if (fs.existsSync(nodeModulesWin)) {
      fs.rmSync(nodeModulesWin, { recursive: true });
    }
    fs.renameSync(nodeModules, nodeModulesWin);
  } else {
    // Unknown or Linux, remove it
    fs.rmSync(nodeModules, { recursive: true });
  }
}

// Restore Linux
if (!fs.existsSync(nodeModulesLinux)) {
  console.error('Error: node_modules_linux does not exist.');
  console.error('Run: npm run install:linux');
  process.exit(1);
}

fs.renameSync(nodeModulesLinux, nodeModules);
console.log('Switched to Linux environment successfully!');
