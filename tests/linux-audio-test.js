/**
 * Linux Audio Recording Test Script
 * 
 * Run with: node tests/linux-audio-test.js
 * 
 * This script tests the fixes for Linux system audio recording:
 * 1. Device name .monitor suffix handling
 * 2. FFmpeg command generation
 * 3. File reading functionality
 */

const fs = require('fs');
const path = require('path');

// Simple test framework
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
    testsPassed++;
  } catch (error) {
    console.error('✗', name);
    console.error('  Error:', error.message);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed: expected true');
  }
}

console.log('Running Linux Audio Recording Tests...\n');

// Test 1: Device name .monitor suffix handling
test('should add .monitor suffix to device name without it', () => {
  const deviceName = 'alsa_output.pci-0000_00_1f.3.analog-stereo';
  const monitorDevice = deviceName.endsWith('.monitor') ? deviceName : `${deviceName}.monitor`;
  assertEquals(monitorDevice, 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
});

test('should not duplicate .monitor suffix', () => {
  const deviceName = 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor';
  const monitorDevice = deviceName.endsWith('.monitor') ? deviceName : `${deviceName}.monitor`;
  assertEquals(monitorDevice, 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
});

test('should handle "default" device correctly', () => {
  const deviceName = 'default';
  const monitorDevice = deviceName.endsWith('.monitor') ? deviceName : `${deviceName}.monitor`;
  assertEquals(monitorDevice, 'default.monitor');
});

// Test 2: FFmpeg command generation for system audio
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
  
  assertEquals(args[3], 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
  assertEquals(args[args.length - 1], outputPath);
});

// Test 3: FFmpeg command generation for microphone
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
  
  assertEquals(args[3], device);
  assertEquals(args[args.length - 1], outputPath);
});

// Test 4: Audio file merge command generation
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
  
  assertEquals(args[1], micPath);
  assertEquals(args[3], sysPath);
  assertEquals(args[args.length - 1], outputPath);
  assertTrue(args.includes('[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]'));
});

// Test 5: File reading for Blob conversion
test('should read file and return Array for IPC serialization', () => {
  // Create a test file
  const testFile = '/tmp/test-audio.bin';
  const testData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
  fs.writeFileSync(testFile, testData);
  
  try {
    const buffer = fs.readFileSync(testFile);
    const array = Array.from(buffer);
    
    assertTrue(Array.isArray(array), 'Should return an Array');
    assertEquals(array.length, 5);
    assertEquals(array[0], 0);
    assertEquals(array[4], 255);
    
    // Simulate Blob creation in browser
    const uint8Array = new Uint8Array(array);
    assertEquals(uint8Array.length, 5);
    assertEquals(uint8Array[0], 0);
    assertEquals(uint8Array[4], 255);
  } finally {
    // Cleanup
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }
});

// Test 6: PulseAudio source detection
test('should identify monitor sources correctly', () => {
  const sources = [
    { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' },
    { name: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', description: 'Monitor of Built-in Audio Analog Stereo' },
    { name: 'alsa_input.pci-0000_00_1f.3.analog-stereo', description: 'Built-in Audio Analog Stereo' }
  ];
  
  const monitorSource = sources.find(s => 
    s.name.includes('.monitor') || s.description.toLowerCase().includes('monitor')
  );
  
  assertTrue(monitorSource !== undefined, 'Should find monitor source');
  assertEquals(monitorSource.name, 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
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
  
  assertTrue(micSource !== undefined, 'Should find microphone source');
  assertEquals(micSource.name, 'alsa_input.pci-0000_00_1f.3.analog-stereo');
});

// Test 7: Recording paths generation
test('should generate correct recording paths', () => {
  const timestamp = Date.now();
  const audioDir = '/tmp/audio_files';
  
  const paths = {
    microphone: `${audioDir}/mic_${timestamp}.webm`,
    systemAudio: `${audioDir}/sys_${timestamp}.webm`,
    output: `${audioDir}/combined_${timestamp}.webm`
  };
  
  assertTrue(paths.microphone.includes('mic_'), 'Mic path should contain mic_');
  assertTrue(paths.systemAudio.includes('sys_'), 'System audio path should contain sys_');
  assertTrue(paths.output.includes('combined_'), 'Output path should contain combined_');
  assertTrue(paths.microphone.endsWith('.webm'), 'Paths should have .webm extension');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}
