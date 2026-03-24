const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

function parsePulseSourceList(stdout = '') {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('\t');
      return {
        id: parts[0] || '',
        name: parts[1] || '',
        driver: parts[2] || '',
        sampleSpec: parts[3] || '',
        state: parts[4] || ''
      };
    })
    .filter(source => source.name);
}

function chooseRecordingSources(sources = []) {
  const usableSources = sources.filter(source => source && source.name);
  const monitor = usableSources.find(source => source.name.includes('.monitor')) || null;

  const physicalMic = usableSources.find(source =>
    !source.name.includes('.monitor') &&
    (source.name.includes('alsa_input') || source.name.includes('.input'))
  ) || null;

  const virtualMic = usableSources.find(source =>
    !source.name.includes('.monitor') &&
    !source.name.startsWith('auto_null') &&
    !source.name.startsWith('default')
  ) || null;

  return {
    microphone: (physicalMic || virtualMic || null)?.name || null,
    monitor: monitor ? monitor.name : null
  };
}

function getAlsaSourceLoadCandidates() {
  return ['hw:0,0', 'hw:1,0', 'hw:0', 'hw:1', 'default'];
}

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
  resetDependencyCheck,
  parsePulseSourceList,
  chooseRecordingSources,
  getAlsaSourceLoadCandidates
};
