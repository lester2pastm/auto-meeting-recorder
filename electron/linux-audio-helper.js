const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

async function detectAudioSystem() {
  if (process.platform !== 'linux') {
    return { type: 'other', available: false };
  }

  try {
    await execPromise('which pactl');
    await execPromise('pactl info');
    return { type: 'pulseaudio', available: true };
  } catch {
    try {
      await execPromise('which pw-cli');
      await execPromise('pw-cli info 0');
      return { type: 'pipewire', available: true };
    } catch {
      return { type: 'unknown', available: false };
    }
  }
}

async function isPackageInstalled(packageName) {
  try {
    const { stdout } = await execPromise(`dpkg -l ${packageName}`);
    return stdout.includes('\nii ');
  } catch {
    return false;
  }
}

async function checkLinuxDependencies(store) {
  if (process.platform !== 'linux') {
    return { hasDependencies: true };
  }

  const hasPrompted = store.get('linuxDependencyPrompted', false);
  if (hasPrompted) {
    return { hasDependencies: true };
  }

  const missingDeps = [];

  const pulseAvailable = await isPackageInstalled('pulseaudio') || 
                         await isPackageInstalled('pulseaudio-module-x11') ||
                         await isPackageInstalled('libpulse0');
  
  if (!pulseAvailable) {
    missingDeps.push({
      name: '音频系统 (PulseAudio)',
      command: 'sudo apt install pulseaudio pavucontrol'
    });
  }

  const ffmpegAvailable = await isPackageInstalled('ffmpeg');
  
  if (!ffmpegAvailable) {
    missingDeps.push({
      name: 'FFmpeg',
      command: 'sudo apt install ffmpeg'
    });
  }

  if (missingDeps.length > 0) {
    return {
      hasDependencies: false,
      missingDeps
    };
  }

  const audioSystem = await detectAudioSystem();

  return {
    hasDependencies: true,
    audioSystem: audioSystem.type,
    needsRemapSource: true
  };
}

async function resetDependencyCheck(store) {
  store.set('linuxDependencyPrompted', false);
  return { success: true };
}

module.exports = {
  detectAudioSystem,
  checkLinuxDependencies,
  resetDependencyCheck
};
