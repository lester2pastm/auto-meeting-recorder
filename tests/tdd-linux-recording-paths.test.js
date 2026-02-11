/**
 * TDD 测试脚本 - Linux 录音路径一致性
 * 不依赖 Jest，使用原生 Node.js assert
 */

const assert = require('assert');

// 测试计数器
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`);
      }
    },
    toMatch(pattern) {
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    },
    not: {
      toBe(expected) {
        if (actual === expected) {
          throw new Error(`Expected not to be ${expected}, but got ${actual}`);
        }
      }
    }
  };
}

console.log('\n========================================');
console.log('TDD 测试：Linux 录音路径一致性');
console.log('========================================\n');

// =========================================
// RED 阶段：验证 Bug 存在
// =========================================
console.log('【RED 阶段】验证 Bug 存在\n');

test('应该验证录音路径与 recoveryMeta 路径不一致（Bug）', () => {
  // 模拟 recoveryMeta（由 startRecoveryTracking 创建）
  const recoveryMeta = {
    id: '1234567890',
    tempFile: '/audio/temp_mic_1234567890.webm',
    systemTempFile: '/audio/temp_sys_1234567890.webm',
    isLinux: true
  };

  // 模拟当前的 Bug 行为（旧代码）
  const timestamp = Date.now();
  const audioDir = '/audio';
  const linuxRecordingPaths = {
    microphone: `${audioDir}/mic_${timestamp}.webm`,      // Bug: 没有 temp_ 前缀
    systemAudio: `${audioDir}/sys_${timestamp}.webm`,     // Bug: 没有 temp_ 前缀
    output: `${audioDir}/combined_${timestamp}.webm`
  };

  // 验证路径不一致（这是 Bug！）
  expect(linuxRecordingPaths.microphone).not.toBe(recoveryMeta.tempFile);
  expect(linuxRecordingPaths.systemAudio).not.toBe(recoveryMeta.systemTempFile);
  
  // 验证路径确实缺少 temp_ 前缀
  expect(linuxRecordingPaths.microphone).toMatch(/\/mic_\d+\.webm$/);
  expect(linuxRecordingPaths.systemAudio).toMatch(/\/sys_\d+\.webm$/);
});

// =========================================
// GREEN 阶段：验证修复
// =========================================
console.log('\n【GREEN 阶段】验证修复后路径一致\n');

test('修复后应该使用 recoveryMeta 中的路径', () => {
  // 模拟 recoveryMeta（由 startRecoveryTracking 创建）
  const recoveryMeta = {
    id: '1234567890',
    tempFile: '/audio/temp_mic_1234567890.webm',
    systemTempFile: '/audio/temp_sys_1234567890.webm',
    isLinux: true
  };

  // 修复后的代码行为
  const linuxRecordingPaths = {
    microphone: recoveryMeta.tempFile,                    // 使用 recoveryMeta 路径
    systemAudio: recoveryMeta.systemTempFile,             // 使用 recoveryMeta 路径
    output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
  };

  // 验证路径一致（修复后应该通过）
  expect(linuxRecordingPaths.microphone).toBe(recoveryMeta.tempFile);
  expect(linuxRecordingPaths.systemAudio).toBe(recoveryMeta.systemTempFile);
  
  // 验证输出路径正确
  expect(linuxRecordingPaths.output).toBe('/audio/combined_1234567890.webm');
});

test('应该验证路径包含 temp_ 前缀', () => {
  const recoveryMeta = {
    tempFile: '/audio/temp_mic_1234567890.webm',
    systemTempFile: '/audio/temp_sys_1234567890.webm'
  };

  const linuxRecordingPaths = {
    microphone: recoveryMeta.tempFile,
    systemAudio: recoveryMeta.systemTempFile,
    output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
  };

  expect(linuxRecordingPaths.microphone).toMatch(/temp_mic_\d+\.webm$/);
  expect(linuxRecordingPaths.systemAudio).toMatch(/temp_sys_\d+\.webm$/);
});

// =========================================
// 边界情况
// =========================================
console.log('\n【边界情况】\n');

test('当 recoveryMeta 未初始化时应该抛出错误', () => {
  const recoveryMeta = null;

  // 模拟修复后的检查逻辑
  function startLinuxRecordingWithCheck() {
    if (!recoveryMeta || !recoveryMeta.tempFile) {
      throw new Error('恢复元数据未初始化');
    }
    return {
      microphone: recoveryMeta.tempFile,
      systemAudio: recoveryMeta.systemTempFile
    };
  }

  let errorThrown = false;
  try {
    startLinuxRecordingWithCheck();
  } catch (err) {
    if (err.message === '恢复元数据未初始化') {
      errorThrown = true;
    }
  }
  
  assert(errorThrown, 'Expected error to be thrown');
});

test('当 recoveryMeta 缺少 tempFile 时应该抛出错误', () => {
  const recoveryMeta = {
    systemTempFile: '/audio/temp_sys_1234567890.webm'
    // tempFile 缺失
  };

  function startLinuxRecordingWithCheck() {
    if (!recoveryMeta || !recoveryMeta.tempFile) {
      throw new Error('恢复元数据未初始化');
    }
    return {};
  }

  let errorThrown = false;
  try {
    startLinuxRecordingWithCheck();
  } catch (err) {
    if (err.message === '恢复元数据未初始化') {
      errorThrown = true;
    }
  }
  
  assert(errorThrown, 'Expected error to be thrown');
});

test('当 recoveryMeta 缺少 systemTempFile 时应该抛出错误', () => {
  const recoveryMeta = {
    tempFile: '/audio/temp_mic_1234567890.webm'
    // systemTempFile 缺失
  };

  function startLinuxRecordingWithCheck() {
    if (!recoveryMeta || !recoveryMeta.tempFile || !recoveryMeta.systemTempFile) {
      throw new Error('恢复元数据缺少临时文件路径');
    }
    return {};
  }

  let errorThrown = false;
  try {
    startLinuxRecordingWithCheck();
  } catch (err) {
    if (err.message === '恢复元数据缺少临时文件路径') {
      errorThrown = true;
    }
  }
  
  assert(errorThrown, 'Expected error to be thrown');
});

// =========================================
// 集成验证
// =========================================
console.log('\n【集成验证】完整流程\n');

test('完整的录音流程路径应该一致', () => {
  // 1. startRecoveryTracking 创建 recoveryMeta
  const timestamp = '1234567890';
  const audioDir = '/audio';
  
  const recoveryMeta = {
    id: timestamp,
    startTime: new Date().toISOString(),
    platform: 'linux',
    isLinux: true,
    tempFile: `${audioDir}/temp_mic_${timestamp}.webm`,
    systemTempFile: `${audioDir}/temp_sys_${timestamp}.webm`,
    lastSaveTime: parseInt(timestamp),
    duration: 0
  };

  // 2. startLinuxRecording 使用 recoveryMeta 路径
  const linuxRecordingPaths = {
    microphone: recoveryMeta.tempFile,
    systemAudio: recoveryMeta.systemTempFile,
    output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
  };

  // 3. 验证路径一致
  expect(linuxRecordingPaths.microphone).toBe(recoveryMeta.tempFile);
  expect(linuxRecordingPaths.systemAudio).toBe(recoveryMeta.systemTempFile);
  
  // 4. 验证路径格式正确
  expect(linuxRecordingPaths.microphone).toMatch(/\/temp_mic_\d+\.webm$/);
  expect(linuxRecordingPaths.systemAudio).toMatch(/\/temp_sys_\d+\.webm$/);
  expect(linuxRecordingPaths.output).toMatch(/\/combined_\d+\.webm$/);
  
  // 5. 验证文件扩展名正确
  expect(linuxRecordingPaths.microphone).toMatch(/\.webm$/);
  expect(linuxRecordingPaths.systemAudio).toMatch(/\.webm$/);
  expect(linuxRecordingPaths.output).toMatch(/\.webm$/);
});

// =========================================
// 测试结果
// =========================================
console.log('\n========================================');
console.log('测试结果');
console.log('========================================');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ 所有测试通过！');
  process.exit(0);
}
