#!/usr/bin/env node

/**
 * Setup script for dual-platform development
 * Run this after cloning the repository to set up both Windows and Linux environments
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const platform = process.platform;

console.log('='.repeat(60));
console.log('Auto Meeting Recorder - Dual Environment Setup');
console.log('='.repeat(60));
console.log(`
Detected platform: ${platform}

This script will help you set up the development environment.
Since this project requires platform-specific dependencies (Electron),
you need separate node_modules for each platform.

IMPORTANT: You need Node.js >= 14 to install dependencies.
Current Node version: ${process.version}
`);

// Check Node version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 14) {
  console.error('ERROR: Node.js version must be >= 14');
  console.error(`Current version: ${nodeVersion}`);
  console.error('\nPlease upgrade Node.js:');
  console.error('  - Linux: Use nvm (https://github.com/nvm-sh/nvm)');
  console.error('  - Windows: Download from https://nodejs.org/');
  process.exit(1);
}

function setupPlatform(targetPlatform) {
  const nodeModulesPath = path.join(rootDir, 'node_modules');
  const platformModulesPath = path.join(rootDir, `node_modules_${targetPlatform === 'win32' ? 'win' : 'linux'}`);
  
  console.log(`\nSetting up ${targetPlatform} environment...`);
  
  // Check if platform-specific node_modules already exists
  if (fs.existsSync(platformModulesPath)) {
    console.log(`  ✓ node_modules_${targetPlatform === 'win32' ? 'win' : 'linux'} already exists`);
    return;
  }
  
  // Install dependencies
  console.log('  → Installing dependencies...');
  try {
    execSync('npm install', { 
      cwd: rootDir, 
      stdio: 'inherit',
      timeout: 300000 
    });
    
    // Move to platform-specific directory
    fs.renameSync(nodeModulesPath, platformModulesPath);
    console.log(`  ✓ Dependencies installed to node_modules_${targetPlatform === 'win32' ? 'win' : 'linux'}`);
    
  } catch (error) {
    console.error(`  ✗ Failed to install dependencies: ${error.message}`);
    process.exit(1);
  }
}

function createSymlink(targetPlatform) {
  const nodeModulesPath = path.join(rootDir, 'node_modules');
  const platformModulesPath = path.join(rootDir, `node_modules_${targetPlatform === 'win32' ? 'win' : 'linux'}`);
  
  // Remove existing node_modules if it exists
  if (fs.existsSync(nodeModulesPath)) {
    const stats = fs.lstatSync(nodeModulesPath);
    if (stats.isSymbolicLink() || stats.isDirectory()) {
      fs.rmSync(nodeModulesPath, { recursive: true });
    }
  }
  
  // Create symlink (Linux/Mac) or junction (Windows)
  if (process.platform === 'win32') {
    // On Windows, use junction
    try {
      execSync(`mklink /J "${nodeModulesPath}" "${platformModulesPath}"`, { stdio: 'ignore' });
      console.log(`  ✓ Created junction: node_modules → node_modules_win`);
    } catch (error) {
      // Fallback to just copying
      console.log('  → Creating copy instead of junction...');
      fs.cpSync(platformModulesPath, nodeModulesPath, { recursive: true });
      console.log(`  ✓ Created copy: node_modules`);
    }
  } else {
    // On Linux/Mac, use symlink
    fs.symlinkSync(platformModulesPath, nodeModulesPath);
    console.log(`  ✓ Created symlink: node_modules → node_modules_linux`);
  }
}

// Main setup logic
console.log('\n' + '-'.repeat(60));

if (platform === 'linux' || platform === 'darwin') {
  console.log('Setting up Linux environment...');
  setupPlatform('linux');
  createSymlink('linux');
  
  console.log('\n' + '='.repeat(60));
  console.log('Linux environment setup complete!');
  console.log('='.repeat(60));
  console.log(`
Next steps:
1. Start development: npm run dev

To set up Windows environment later:
1. Switch to Windows machine
2. Run: node scripts/setup.js
3. Or manually: npm run install:win
`);
  
} else if (platform === 'win32') {
  console.log('Setting up Windows environment...');
  setupPlatform('win32');
  createSymlink('win32');
  
  console.log('\n' + '='.repeat(60));
  console.log('Windows environment setup complete!');
  console.log('='.repeat(60));
  console.log(`
Next steps:
1. Start development: npm run dev

To set up Linux environment later:
1. Switch to Linux machine
2. Run: node scripts/setup.js
3. Or manually: npm run install:linux
`);
}

console.log(`
For detailed instructions, see: DUAL_ENV_SETUP.md
`);
