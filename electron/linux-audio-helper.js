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

async function checkLinuxDependencies(store) {
  if (process.platform !== 'linux') {
    return { hasDependencies: true };
  }

  const hasPrompted = store.get('linuxDependencyPrompted', false);
  if (hasPrompted) {
    return { hasDependencies: true };
  }

  const audioSystem = await detectAudioSystem();

  if (!audioSystem.available) {
    let installCommand = '';
    let packageManager = '';

    try {
      await execPromise('which apt');
      packageManager = 'apt';
      installCommand = 'sudo apt install pulseaudio pavucontrol';
    } catch {
      try {
        await execPromise('which dnf');
        packageManager = 'dnf';
        installCommand = 'sudo dnf install pulseaudio pavucontrol';
      } catch {
        try {
          await execPromise('which pacman');
          packageManager = 'pacman';
          installCommand = 'sudo pacman -S pulseaudio pavucontrol';
        } catch {
          packageManager = 'unknown';
          installCommand = '请查阅文档安装 PulseAudio 和 pavucontrol';
        }
      }
    }

    return {
      hasDependencies: false,
      packageManager,
      installCommand
    };
  }

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
