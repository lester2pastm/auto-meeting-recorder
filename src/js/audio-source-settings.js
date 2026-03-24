const AUDIO_SOURCE_AUTO = 'auto';
const AUDIO_SOURCE_UNAVAILABLE = 'unavailable';

function getDefaultAudioSourceSettings(settings = {}) {
    return {
        preferredMicSource: settings.preferredMicSource || AUDIO_SOURCE_AUTO,
        preferredSystemSource: settings.preferredSystemSource || AUDIO_SOURCE_AUTO
    };
}

function resolvePreferredAudioSource({ preferredSource, sources = [], recommendedSource = null }) {
    if (preferredSource && preferredSource !== AUDIO_SOURCE_AUTO) {
        const matched = sources.find(source => source.id === preferredSource);
        if (matched) {
            return preferredSource;
        }
    }

    if (recommendedSource) {
        const recommended = sources.find(source => source.id === recommendedSource);
        if (recommended) {
            return recommendedSource;
        }
    }

    return AUDIO_SOURCE_AUTO;
}

function buildLinuxAudioSourceState(sources = []) {
    const microphoneSources = sources
        .filter(source => source && source.name && !source.name.includes('.monitor'))
        .map(source => ({
            id: source.name,
            label: source.description || source.name,
            description: source.description || source.name,
            driver: source.driver || ''
        }));

    const systemSources = sources
        .filter(source => source && source.name && source.name.includes('.monitor'))
        .map(source => ({
            id: source.name,
            label: source.description || source.name,
            description: source.description || source.name,
            driver: source.driver || ''
        }));

    const preferredPhysicalMic = microphoneSources.find(source => source.id.includes('alsa_input'));
    const preferredVirtualMic = microphoneSources.find(source => !source.id.includes('echo-cancel.monitor'));
    const preferredSystemSource = systemSources.find(source => !source.id.includes('echo-cancel.monitor')) || systemSources[0] || null;

    return {
        microphoneSources,
        systemSources,
        recommendedMicSource: (preferredPhysicalMic || preferredVirtualMic || microphoneSources[0] || null)?.id || null,
        recommendedSystemSource: preferredSystemSource ? preferredSystemSource.id : null,
        unavailableValue: AUDIO_SOURCE_UNAVAILABLE
    };
}

const exported = {
    AUDIO_SOURCE_AUTO,
    AUDIO_SOURCE_UNAVAILABLE,
    getDefaultAudioSourceSettings,
    resolvePreferredAudioSource,
    buildLinuxAudioSourceState
};

if (typeof window !== 'undefined') {
    window.audioSourceSettings = exported;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}
