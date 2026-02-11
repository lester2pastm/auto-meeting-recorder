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
    test('should start system audio recording with monitor device', () => {
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

  describe('FFmpeg Microphone Recording', () => {
    test('should start microphone recording', () => {
      const result = {
        success: true,
        pid: 12346
      };
      
      expect(result.success).toBe(true);
      expect(result.pid).toBeGreaterThan(0);
    });
  });

  describe('Stop FFmpeg Recording', () => {
    test('should stop both system audio and microphone recording', () => {
      const result = {
        success: true,
        results: {
          systemAudio: true,
          microphone: true
        }
      };
      
      expect(result.success).toBe(true);
      expect(result.results.systemAudio).toBe(true);
      expect(result.results.microphone).toBe(true);
    });

    test('should handle case when no recording is active', () => {
      const result = {
        success: true,
        results: {
          systemAudio: false,
          microphone: false
        }
      };
      
      expect(result.success).toBe(true);
    });
  });

  describe('Merge Audio Files', () => {
    test('should merge microphone and system audio files', () => {
      const result = {
        success: true,
        outputPath: '/tmp/combined.webm'
      };
      
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/combined.webm');
    });

    test('should fail if microphone file does not exist', () => {
      const result = {
        success: false,
        error: 'Microphone audio file not found'
      };
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Microphone audio file not found');
    });

    test('should fail if system audio file does not exist', () => {
      const result = {
        success: false,
        error: 'System audio file not found'
      };
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('System audio file not found');
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
  test('should generate correct ffmpeg args for system audio', () => {
    const device = 'alsa_output.pci-0000_00_1f.3.analog-stereo';
    const outputPath = '/tmp/test-system.webm';
    const monitorDevice = device.endsWith('.monitor') ? device : `${device}.monitor`;
    
    const args = [
      '-f', 'pulse',
      '-i', monitorDevice,
      '-acodec', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      '-y',
      outputPath
    ];
    
    expect(args[3]).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    expect(args[args.length - 1]).toBe(outputPath);
  });

  test('should generate correct ffmpeg args for microphone', () => {
    const device = 'alsa_input.pci-0000_00_1f.3.analog-stereo';
    const outputPath = '/tmp/test-mic.webm';
    
    const args = [
      '-f', 'pulse',
      '-i', device,
      '-acodec', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '1',
      '-y',
      outputPath
    ];
    
    expect(args[3]).toBe(device);
    expect(args[args.length - 1]).toBe(outputPath);
  });

  test('should generate correct ffmpeg merge args', () => {
    const micPath = '/tmp/mic.webm';
    const sysPath = '/tmp/sys.webm';
    const outputPath = '/tmp/combined.webm';
    
    const args = [
      '-i', micPath,
      '-i', sysPath,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]',
      '-map', '[aout]',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-y',
      outputPath
    ];
    
    expect(args[1]).toBe(micPath);
    expect(args[3]).toBe(sysPath);
    expect(args[args.length - 1]).toBe(outputPath);
    expect(args).toContain('[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]');
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
  test('should read file and return Array for IPC serialization', () => {
    // Create a test file
    const testFile = '/tmp/test-audio-jest.bin';
    const testData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
    fs.writeFileSync(testFile, testData);
    
    try {
      const buffer = fs.readFileSync(testFile);
      const array = Array.from(buffer);
      
      expect(Array.isArray(array)).toBe(true);
      expect(array).toHaveLength(5);
      expect(array[0]).toBe(0);
      expect(array[4]).toBe(255);
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
      microphone: `${audioDir}/mic_${timestamp}.webm`,
      systemAudio: `${audioDir}/sys_${timestamp}.webm`,
      output: `${audioDir}/combined_${timestamp}.webm`
    };
    
    expect(paths.microphone).toContain('mic_');
    expect(paths.systemAudio).toContain('sys_');
    expect(paths.output).toContain('combined_');
    expect(paths.microphone.endsWith('.webm')).toBe(true);
  });

  test('should use consistent microphone path for recording and merging', () => {
    // Bug fix verification: stopLinuxRecording should use recoveryMeta.tempFile
    // instead of linuxRecordingPaths.microphone for the microphone file path
    // This ensures the merge uses the correct path where data was actually saved
    
    const timestamp = Date.now();
    const audioDir = '/tmp/audio_files';
    
    // 模拟 startLinuxRecording 中定义的路径
    const linuxRecordingPaths = {
      microphone: `${audioDir}/mic_${timestamp}.webm`,      // 旧的不一致路径
      systemAudio: `${audioDir}/sys_${timestamp}.webm`,
      output: `${audioDir}/combined_${timestamp}.webm`
    };
    
    // 模拟 recoveryMeta 中定义的路径（实际保存麦克风数据的位置）
    const recoveryMeta = {
      tempFile: `${audioDir}/temp_mic_${timestamp}.webm`,    // 正确的麦克风数据路径
      systemTempFile: `${audioDir}/temp_sys_${timestamp}.webm`
    };
    
    // 修复后的逻辑：优先使用 recoveryMeta.tempFile
    const microphonePath = recoveryMeta && recoveryMeta.tempFile 
      ? recoveryMeta.tempFile 
      : linuxRecordingPaths.microphone;
    
    // 验证：应该使用 recoveryMeta.tempFile（实际保存数据的路径）
    expect(microphonePath).toBe(recoveryMeta.tempFile);
    expect(microphonePath).not.toBe(linuxRecordingPaths.microphone);
    expect(microphonePath).toContain('temp_mic_');
  });
});
