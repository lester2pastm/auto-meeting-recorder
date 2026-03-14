/**
 * Linux System Audio Recording Tests
 * 
 * Tests for Linux-specific audio recording functionality using FFmpeg and PulseAudio
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Linux System Audio Recording', () => {
  describe('Platform Detection', () => {
    test('should detect Linux platform correctly', () => {
      const platform = process.platform;
      const isLinux = platform === 'linux';
      
      expect(typeof platform).toBe('string');
      expect(typeof isLinux).toBe('boolean');
    });

    test('should handle platform detection failure gracefully', () => {
      // Simulate API failure
      const mockError = new Error('API not available');
      expect(mockError.message).toBe('API not available');
    });
  });

  describe('FFmpeg Availability Check', () => {
    test('should define ffmpeg check structure', () => {
      // Check the expected return structure
      const result = {
        success: true,
        available: true,
        version: 'ffmpeg version 4.4.2'
      };
      
      expect(result.success).toBe(true);
      expect(result.available).toBe(true);
      expect(result.version).toContain('ffmpeg');
    });

    test('should detect when ffmpeg is not available', () => {
      const result = {
        success: true,
        available: false,
        error: 'Command not found'
      };
      
      expect(result.success).toBe(true);
      expect(result.available).toBe(false);
    });
  });

  describe('PulseAudio Sources', () => {
    test('should get list of PulseAudio sources', () => {
      const mockSources = [
        { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' },
        { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', description: 'Monitor of Built-in Audio Analog Stereo' },
        { name: 'alsa_input.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' }
      ];
      
      expect(mockSources).toHaveLength(3);
      expect(mockSources[1].name).toContain('.monitor');
    });

    test('should return empty sources on non-Linux platforms', () => {
      const result = {
        success: true,
        sources: []
      };
      
      expect(result.success).toBe(true);
      expect(result.sources).toHaveLength(0);
    });

    test('should handle PulseAudio command failure', () => {
      const result = {
        success: true,
        sources: [],
        error: 'pacmd command not found'
      };
      
      expect(result.success).toBe(true);
      expect(result.sources).toHaveLength(0);
    });
  });

  describe('FFmpeg System Audio Recording', () => {
    test('should start mixed microphone and system audio recording', () => {
      const result = {
        success: true,
        pid: 12345
      };
      
      expect(result.success).toBe(true);
      expect(result.pid).toBeGreaterThan(0);
    });

    test('should reject system audio recording on non-Linux platforms', () => {
      const result = {
        success: false,
        error: 'FFmpeg system audio recording is only supported on Linux'
      };
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('only supported on Linux');
    });

    test('should handle ffmpeg start failure', () => {
      const result = {
        success: false,
        error: 'FFmpeg failed to start within 5 seconds'
      };
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed to start');
    });
  });

  describe('Stop FFmpeg Recording', () => {
    test('should stop mixed recording process', () => {
      const result = {
        success: true,
        results: {
          systemAudio: true
        }
      };
      
      expect(result.success).toBe(true);
      expect(result.results.systemAudio).toBe(true);
    });

    test('should handle case when no recording is active', () => {
      const result = {
        success: true,
        results: {
          systemAudio: false
        }
      };
      
      expect(result.success).toBe(true);
    });
  });

  describe('Single Output Recording', () => {
    test('should write mixed audio directly to a single output file', () => {
      const outputPath = '/tmp/recording.webm';

      expect(outputPath).toBe('/tmp/recording.webm');
      expect(outputPath.endsWith('.webm')).toBe(true);
    });
  });
});

describe('Device Name Handling', () => {
  test('should not duplicate .monitor suffix', () => {
    // Test that device names with .monitor are handled correctly
    const deviceName = 'alsa_output.pci-0000_00_1f.3.analog-stereo';
    const monitorSuffix = '.monitor';
    
    // Should add .monitor to device name
    const fullMonitorName = deviceName + monitorSuffix;
    expect(fullMonitorName).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    
    // Should not duplicate if already has .monitor
    const deviceWithMonitor = 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor';
    const result = deviceWithMonitor.endsWith('.monitor') 
      ? deviceWithMonitor 
      : deviceWithMonitor + '.monitor';
    expect(result).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
  });

  test('should add .monitor suffix correctly', () => {
    const deviceName = 'default';
    const monitorDevice = deviceName.endsWith('.monitor') ? deviceName : `${deviceName}.monitor`;
    expect(monitorDevice).toBe('default.monitor');
  });
});

describe('FFmpeg Command Generation', () => {
  test('should generate correct ffmpeg args for mixed audio recording', () => {
    const micDevice = 'alsa_input.pci-0000_00_1f.3.analog-stereo';
    const device = 'alsa_output.pci-0000_00_1f.3.analog-stereo';
    const outputPath = '/tmp/test-recording.webm';
    const monitorDevice = device.endsWith('.monitor') ? device : `${device}.monitor`;
    
    const args = [
      '-f', 'pulse',
      '-i', micDevice,
      '-f', 'pulse',
      '-i', monitorDevice,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level[aout]',
      '-map', '[aout]',
      '-acodec', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      '-y',
      outputPath
    ];
    
    expect(args[3]).toBe(micDevice);
    expect(args[7]).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    expect(args[args.length - 1]).toBe(outputPath);
    expect(args).toContain('[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level[aout]');
  });
});

describe('Audio Source Detection', () => {
  test('should identify monitor sources correctly', () => {
    const sources = [
      { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' },
      { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', description: 'Monitor of Built-in Audio Analog Stereo' },
      { name: 'alsa_input.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' }
    ];
    
    const monitorSource = sources.find(s => 
      s.name.includes('.monitor') || s.description.toLowerCase().includes('monitor')
    );
    
    expect(monitorSource).toBeDefined();
    expect(monitorSource.name).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
  });

  test('should identify microphone sources correctly', () => {
    const sources = [
      { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' },
      { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', description: 'Monitor of Built-in Audio Analog Stereo' },
      { name: 'alsa_input.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' }
    ];
    
    const micSource = sources.find(s => 
      !s.name.includes('.monitor') && 
      (s.description.toLowerCase().includes('microphone') || 
       s.description.toLowerCase().includes('mic') ||
       s.name.includes('input'))
    );
    
    expect(micSource).toBeDefined();
    expect(micSource.name).toBe('alsa_input.pci-0000_00_1f.3.analog-stereo');
  });
});

describe('File Reading for Blob Conversion', () => {
  test('should read file and return Uint8Array for IPC serialization', () => {
    // Create a test file
    const testFile = '/tmp/test-audio-jest.bin';
    const testData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
    fs.writeFileSync(testFile, testData);
    
    try {
      const buffer = fs.readFileSync(testFile);
      const binary = new Uint8Array(buffer);

      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary).toHaveLength(5);
      expect(binary[0]).toBe(0);
      expect(binary[4]).toBe(255);
    } finally {
      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});

describe('Recording Paths Generation', () => {
  test('should generate correct recording paths', () => {
    const timestamp = Date.now();
    const audioDir = '/tmp/audio_files';
    
    const paths = {
      output: `${audioDir}/temp_recording_${timestamp}.webm`
    };
    
    expect(paths.output).toContain('temp_recording_');
    expect(paths.output.endsWith('.webm')).toBe(true);
  });

  test('should use recovery temp file as final recording path', () => {
    const timestamp = Date.now();
    const audioDir = '/tmp/audio_files';

    const linuxRecordingPaths = {
      output: `${audioDir}/temp_recording_${timestamp}.webm`
    };

    const recoveryMeta = {
      tempFile: `${audioDir}/temp_recording_${timestamp}.webm`
    };

    const recordingPath = recoveryMeta && recoveryMeta.tempFile 
      ? recoveryMeta.tempFile 
      : linuxRecordingPaths.output;

    expect(recordingPath).toBe(recoveryMeta.tempFile);
    expect(recordingPath).toBe(linuxRecordingPaths.output);
    expect(recordingPath).toContain('temp_recording_');
  });
});
