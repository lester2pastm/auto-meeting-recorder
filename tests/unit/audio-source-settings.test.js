const {
  AUDIO_SOURCE_AUTO,
  AUDIO_SOURCE_UNAVAILABLE,
  getDefaultAudioSourceSettings,
  resolvePreferredAudioSource,
  buildLinuxAudioSourceState
} = require('../../src/js/audio-source-settings');

describe('Audio source settings helpers', () => {
  test('should provide default preferred source settings', () => {
    expect(getDefaultAudioSourceSettings()).toEqual({
      preferredMicSource: AUDIO_SOURCE_AUTO,
      preferredSystemSource: AUDIO_SOURCE_AUTO
    });
  });

  test('should keep preferred source when it is still available', () => {
    const selected = resolvePreferredAudioSource({
      preferredSource: 'mic-2',
      sources: [{ id: 'mic-1' }, { id: 'mic-2' }],
      recommendedSource: 'mic-1'
    });

    expect(selected).toBe('mic-2');
  });

  test('should fall back to recommended source when preferred source is missing', () => {
    const selected = resolvePreferredAudioSource({
      preferredSource: 'missing-mic',
      sources: [{ id: 'mic-1' }, { id: 'mic-2' }],
      recommendedSource: 'mic-2'
    });

    expect(selected).toBe('mic-2');
  });

  test('should fall back to auto when no recommended source exists', () => {
    const selected = resolvePreferredAudioSource({
      preferredSource: 'missing-system',
      sources: [],
      recommendedSource: null
    });

    expect(selected).toBe(AUDIO_SOURCE_AUTO);
  });

  test('should build linux source state with separated microphone and system sources', () => {
    const state = buildLinuxAudioSourceState([
      { name: 'alsa_output.platform.stereo-fallback.monitor', description: 'Monitor', driver: 'module-alsa-card.c' },
      { name: 'alsa_input.platform.stereo-fallback', description: 'Mic', driver: 'module-alsa-card.c' },
      { name: 'noiseReduceSource', description: 'Noise Reduce', driver: 'module-echo-cancel.c' }
    ]);

    expect(state.microphoneSources.map(source => source.id)).toEqual([
      'alsa_input.platform.stereo-fallback',
      'noiseReduceSource'
    ]);
    expect(state.systemSources.map(source => source.id)).toEqual([
      'alsa_output.platform.stereo-fallback.monitor'
    ]);
    expect(state.recommendedMicSource).toBe('alsa_input.platform.stereo-fallback');
    expect(state.recommendedSystemSource).toBe('alsa_output.platform.stereo-fallback.monitor');
    expect(state.unavailableValue).toBe(AUDIO_SOURCE_UNAVAILABLE);
  });
});
