#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeModules = path.join(rootDir, 'node_modules');
const nodeModulesLinux = path.join(rootDir, 'node_modules_linux');
const nodeModulesWin = path.join(rootDir, 'node_modules_win');

console.log('Switching to Windows environment...');

// Check if already on Windows
if (fs.existsSync(nodeModulesWin)) {
  const stats = fs.statSync(nodeModulesWin);
  if (!stats.isDirectory()) {
    console.log('Already on Windows environment.');
    process.exit(0);
  }
}

// Backup current if it exists and is not already backed up
if (fs.existsSync(nodeModules)) {
  const electronLinux = path.join(nodeModules, 'electron', 'dist', 'electron');
  if (fs.existsSync(electronLinux)) {
    // It's Linux, backup it
    console.log('Backing up Linux node_modules...');
    if (fs.existsSync(nodeModulesLinux)) {
      fs.rmSync(nodeModulesLinux, { recursive: true });
    }
    fs.renameSync(nodeModules, nodeModulesLinux);
  } else {
    // Unknown or Windows, remove it
    fs.rmSync(nodeModules, { recursive: true });
  }
}

// Restore Windows
if (!fs.existsSync(nodeModulesWin)) {
  console.error('Error: node_modules_win does not exist.');
  console.error('Run: npm run install:win (on Windows)');
  process.exit(1);
}

fs.renameSync(nodeModulesWin, nodeModules);
console.log('Switched to Windows environment successfully!');
