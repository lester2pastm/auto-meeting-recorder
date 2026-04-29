const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runShellCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ code });
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command}`));
    });
  });
}

async function runCommandWithRetry({
  command,
  attempts = 3,
  delayMs = 15000,
  runCommand = runShellCommand,
  sleep: sleepFn = sleep
}) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error('A command is required');
  }

  const joinedCommand = command.join(' ');
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runCommand(joinedCommand);
      return;
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      console.log(`[Retry] Attempt ${attempt}/${attempts} failed for: ${joinedCommand}`);
      console.log(`[Retry] Waiting ${delayMs}ms before retrying...`);
      await sleepFn(delayMs);
    }
  }

  throw lastError;
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');

  if (separatorIndex === -1) {
    throw new Error('Usage: node scripts/run-with-retry.js --attempts <n> --delay-ms <ms> -- <command>');
  }

  const optionArgs = argv.slice(0, separatorIndex);
  const command = argv.slice(separatorIndex + 1);
  let attempts = 3;
  let delayMs = 15000;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === '--attempts') {
      attempts = Number(optionArgs[index + 1]);
      index += 1;
    } else if (arg === '--delay-ms') {
      delayMs = Number(optionArgs[index + 1]);
      index += 1;
    }
  }

  return {
    attempts,
    delayMs,
    command
  };
}

async function main() {
  const { attempts, delayMs, command } = parseArgs(process.argv.slice(2));
  await runCommandWithRetry({ command, attempts, delayMs });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runCommandWithRetry
};
