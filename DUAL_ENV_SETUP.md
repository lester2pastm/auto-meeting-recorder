# Dual Environment Setup (No Symlink Support)

This guide explains how to maintain both Windows and Linux development environments when your filesystem doesn't support symbolic links.

## How It Works

Instead of using symlinks (which aren't supported on this filesystem), we use directory renaming:

- `node_modules_linux/` - Linux dependencies
- `node_modules_win/` - Windows dependencies  
- `node_modules/` - Currently active platform (renamed from one of the above)

## Quick Start

### Linux Environment

```bash
# Switch to Linux (moves node_modules_linux to node_modules)
npm run use:linux

# Run the app
npm run dev
```

### Windows Environment

```cmd
:: Switch to Windows (moves node_modules_win to node_modules)
npm run use:win

:: Run the app
npm run dev
```

## Initial Setup

### On Linux (Current Machine)

1. Install nvm and Node 18:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   source ~/.bashrc
   nvm install 18
   nvm use 18
   ```

2. Install dependencies:
   ```bash
   npm run use:linux
   npm install
   ```

   Note: If npm install fails due to symlink errors, use the China mirror:
   ```bash
   export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
   npm install
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

### On Windows

1. Install Node 18 from https://nodejs.org/

2. Clone the repository and navigate to it

3. Install dependencies:
   ```cmd
   npm run use:win
   npm install
   ```

4. Run the app:
   ```cmd
   npm run dev
   ```

## Available Scripts

- `npm run use:linux` - Switch to Linux environment
- `npm run use:win` - Switch to Windows environment
- `npm run dev` - Run the app (uses current environment)
- `npm run dev:linux` - Switch to Linux and run
- `npm run dev:win` - Switch to Windows and run
- `npm run install:linux` - Install dependencies for Linux
- `npm run install:win` - Install dependencies for Windows

## Switching Between Platforms

The switch scripts automatically:
1. Detect the current platform
2. Backup current `node_modules` to platform-specific directory
3. Restore the target platform's `node_modules`

Example workflow:
```bash
# Working on Linux
npm run dev

# Need to test on Windows
npm run use:win
npm run dev

# Back to Linux
npm run use:linux
npm run dev
```

## Troubleshooting

### "node_modules_linux does not exist"

You need to install dependencies first:
```bash
npm run use:linux
npm install
```

### "Cannot find module 'electron-store'"

The dependencies weren't fully installed. Try:
```bash
rm -rf node_modules node_modules_linux
npm run use:linux
npm install
```

### Symlink errors during install

If you see errors like:
```
npm error ENOTSUP: operation not supported on socket, symlink
```

Use the China mirror for Electron:
```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### App doesn't start

Check that you're using the right Node version:
```bash
node --version  # Should be v18.x.x
```

If not:
```bash
nvm use 18
```

## Important Notes

1. **No parallel development**: You can't run both environments simultaneously with this setup because they share the `node_modules` directory.

2. **Switching takes time**: Renaming directories is faster than copying, but still takes a moment for large `node_modules`.

3. **Keep both backed up**: Don't delete `node_modules_linux` or `node_modules_win` - they contain your platform-specific dependencies!

4. **Git**: Platform-specific directories are in `.gitignore` and won't be committed.

## Alternative: Copy-Based Switching

If renaming doesn't work for your use case, you can use the copy-based switcher (slower but keeps both environments intact):

```bash
# Use copy-based switching
node scripts/switch-platform.js linux
```

This copies files instead of renaming, which takes longer but allows you to keep both environments fully intact.
