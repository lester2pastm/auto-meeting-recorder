const { test, expect } = require('@playwright/test');

async function mockApiResponses(page) {
  await page.route('https://stt.example.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: '这是 E2E 转写结果' })
    });
  });

  await page.route('https://summary.example.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: '这是 E2E 纪要结果'
            }
          }
        ]
      })
    });
  });
}

async function gotoApp(page) {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppReady(page);
}

async function openSettings(page) {
  await page.click('.nav-item[data-view="settings"]');
  await expect(page.locator('#settingsView')).toHaveClass(/active/);
}

async function waitForAppReady(page) {
  await expect(page.locator('#btnStartRecording')).toBeVisible();
  await expect(page.locator('#toast')).toContainText(/应用初始化成功|initialized successfully/);
}

async function configureApiSettings(page) {
  await openSettings(page);

  await page.fill('#sttApiUrl', 'https://stt.example.com/v1/audio/transcriptions');
  await page.fill('#sttApiKey', 'stt-key');
  await page.fill('#sttModel', 'whisper-1');
  await page.click('#btnTestSttApi');
  await expect(page.locator('#toast')).toContainText('设置已自动保存');

  await page.fill('#summaryApiUrl', 'https://summary.example.com/v1/chat/completions');
  await page.fill('#summaryApiKey', 'summary-key');
  await page.fill('#summaryModel', 'gpt-4o-mini');
  await page.click('#btnTestSummaryApi');
  await expect(page.locator('#toast')).toContainText('设置已自动保存');
}

async function installRecordingMocks(page) {
  await page.evaluate(() => {
    window.__mockRecordingState = {
      isRecording: false,
      isPaused: false
    };

    startRecording = async () => {
      window.__mockRecordingState = {
        isRecording: true,
        isPaused: false
      };
      return true;
    };

    stopRecording = async () => {
      window.__mockRecordingState = {
        isRecording: false,
        isPaused: false
      };
      return new Blob(['fake-audio'], { type: 'audio/webm' });
    };

    pauseRecording = () => {
      window.__mockRecordingState = {
        isRecording: true,
        isPaused: true
      };
    };

    resumeRecording = () => {
      window.__mockRecordingState = {
        isRecording: true,
        isPaused: false
      };
    };

    getRecordingState = () => ({ ...window.__mockRecordingState });
    getRecordingDuration = () => '00:00:03';
    setAudioFileReadyCallback = () => {};
  });
}

async function installProcessingMocks(page) {
  await page.evaluate(() => {
    transcribeAudio = async () => ({
      success: true,
      text: '这是 E2E 转写结果'
    });

    generateSummary = async () => ({
      success: true,
      summary: '这是 E2E 纪要结果'
    });
  });
}

async function installTranscriptionFailureMock(page, message = '服务暂时不可用') {
  await page.evaluate((failureMessage) => {
    transcribeAudio = async () => ({
      success: false,
      message: failureMessage
    });
  }, message);
}

async function installDetailAudioMocks(page, transcriptText = '这是详情页重新转写结果') {
  await page.evaluate((nextTranscriptText) => {
    window.electronAPI = window.electronAPI || {};
    getAudioFile = async () => ({
      success: true,
      blob: new Blob(['fake-audio'], { type: 'audio/webm' })
    });

    transcribeAudio = async () => ({
      success: true,
      text: nextTranscriptText
    });
  }, transcriptText);
}

async function installSummaryRefreshMock(page, summaryText = '这是详情页重新生成的纪要') {
  await page.evaluate((nextSummaryText) => {
    generateSummary = async () => ({
      success: true,
      summary: nextSummaryText
    });
  }, summaryText);
}

async function installSummaryFailureMock(page, message = '服务暂时不可用') {
  await page.evaluate((failureMessage) => {
    generateSummary = async () => ({
      success: false,
      message: failureMessage
    });
  }, message);
}

async function seedHistoryMeeting(page, overrides = {}) {
  await page.evaluate(async (meetingOverrides) => {
    const seedMeeting = {
      id: 'seed-meeting-1',
      date: '2026-04-04T10:30:00.000Z',
      duration: '00:12:34',
      transcript: '这是历史详情里的转写内容',
      summary: '这是历史详情里的会议纪要',
      transcriptStatus: 'completed',
      summaryStatus: 'completed',
      ...meetingOverrides
    };

    await saveMeeting(seedMeeting);
    await loadHistoryList();
  }, overrides);
}

async function showRecoveryDialogWithMocks(page, { processResult = 'transcribe' } = {}) {
  await page.evaluate(async ({ recoveryAction }) => {
    window.__recoveryMeta = {
      startTime: '2026-04-04T09:00:00.000Z',
      duration: 185000,
      lastSaveTime: Date.now() - 60000,
      tempFile: '/tmp/recovery-audio.webm'
    };
    window.__recoveryCleared = false;

    getRecoveryMeta = () => window.__recoveryMeta;
    recoverAudioBlob = async () => new Blob(['fake-audio'], { type: 'audio/webm' });
    clearRecoveryData = async () => {
      window.__recoveryCleared = true;
      window.__recoveryMeta = null;
    };

    if (recoveryAction === 'transcribe') {
      transcribeAudio = async () => ({
        success: true,
        text: '这是恢复录音的转写结果'
      });
      generateSummary = async () => ({
        success: true,
        summary: '这是恢复录音的纪要结果'
      });
    }

    await showRecoveryDialog({
      startTime: '2026-04-04T09:00:00.000Z',
      duration: 185000,
      lastSaveTime: Date.now() - 60000
    });
  }, { recoveryAction: processResult });
}

test.describe('Core E2E flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
    await gotoApp(page);
  });

  test('should test API settings successfully and restore them after reload', async ({ page }) => {
    await configureApiSettings(page);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await openSettings(page);

    await expect(page.locator('#sttApiUrl')).toHaveValue('https://stt.example.com/v1/audio/transcriptions');
    await expect(page.locator('#sttApiKey')).toHaveValue('stt-key');
    await expect(page.locator('#sttModel')).toHaveValue('whisper-1');
    await expect(page.locator('#summaryApiUrl')).toHaveValue('https://summary.example.com/v1/chat/completions');
    await expect(page.locator('#summaryApiKey')).toHaveValue('summary-key');
    await expect(page.locator('#summaryModel')).toHaveValue('gpt-4o-mini');
  });

  test('should complete the happy-path recording flow and save the result to history', async ({ page }) => {
    await installRecordingMocks(page);
    await installProcessingMocks(page);
    await configureApiSettings(page);

    await page.click('.nav-item[data-view="recorder"]');
    await expect(page.locator('#recorderView')).toHaveClass(/active/);

    await page.click('#btnStartRecording');
    await expect(page.locator('#toast')).toContainText('录音已开始');
    await expect(page.locator('#btnStopRecording')).toBeVisible();

    await page.click('#btnStopRecording');

    await expect(page.locator('#subtitleContent')).toContainText('这是 E2E 转写结果');
    await page.click('.tab-btn[data-tab="summary"]');
    await expect(page.locator('#summaryContent')).toContainText('这是 E2E 纪要结果');

    await page.click('.nav-item[data-view="history"]');
    await expect(page.locator('.history-item')).toHaveCount(1);
    await expect(page.locator('.history-item-duration')).toContainText('00:00:03');
  });

  test('should show retry entry when transcription fails after recording', async ({ page }) => {
    await installRecordingMocks(page);
    await installTranscriptionFailureMock(page, '服务暂时不可用');
    await configureApiSettings(page);

    await page.click('.nav-item[data-view="recorder"]');
    await expect(page.locator('#recorderView')).toHaveClass(/active/);

    await page.click('#btnStartRecording');
    await expect(page.locator('#btnStopRecording')).toBeVisible();

    await page.click('#btnStopRecording');

    await expect(page.locator('#subtitleContent')).toContainText('转写失败，请重新转写');
    await expect(page.locator('#btnRetryTranscription')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('转写失败: 服务暂时不可用');

    await page.click('.nav-item[data-view="history"]');
    await expect(page.locator('.history-item')).toHaveCount(1);
  });

  test('should open meeting detail from history and show transcript and summary', async ({ page }) => {
    await seedHistoryMeeting(page);

    await page.click('.nav-item[data-view="history"]');
    await expect(page.locator('.history-item')).toHaveCount(1);
    await expect(page.locator('.history-item-date')).toContainText('2026-04-04');

    await page.locator('.history-item .btn.btn-outline').click();

    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    await expect(page.locator('#detailContent')).toContainText('这是历史详情里的转写内容');
    await expect(page.locator('#detailContent')).toContainText('这是历史详情里的会议纪要');
    await expect(page.locator('#detailContent')).toContainText('00:12:34');
  });

  test('should refresh transcript from meeting detail', async ({ page }) => {
    await configureApiSettings(page);
    await installDetailAudioMocks(page, '这是详情页重新转写结果');
    await seedHistoryMeeting(page, {
      audioFilename: '/virtual/seed-meeting.webm',
      transcript: '旧的转写内容',
      summary: '旧的纪要内容'
    });

    await page.click('.nav-item[data-view="history"]');
    await page.locator('.history-item .btn.btn-outline').click();

    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    await page.click('#btnRefreshTranscript_seed-meeting-1');

    await expect(page.locator('#detailTranscriptContent_seed-meeting-1')).toContainText('这是详情页重新转写结果');
    await expect(page.locator('#toast')).toContainText(/转写完成|会议记录已保存|纪要生成成功/);
  });

  test('should regenerate summary from meeting detail', async ({ page }) => {
    await configureApiSettings(page);
    await installSummaryRefreshMock(page, '这是详情页重新生成的纪要');
    await seedHistoryMeeting(page, {
      transcript: '这是可用于生成纪要的转写文本',
      summary: '旧的纪要内容'
    });

    await page.click('.nav-item[data-view="history"]');
    await page.locator('.history-item .btn.btn-outline').click();

    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    await page.click('#btnRefreshSummary_seed-meeting-1');

    await expect(page.locator('#detailSummaryContent_seed-meeting-1')).toContainText('这是详情页重新生成的纪要');
    await expect(page.locator('#toast')).toContainText('纪要已重新生成');
  });

  test('should keep previous summary when summary regeneration fails in detail view', async ({ page }) => {
    await configureApiSettings(page);
    await installSummaryFailureMock(page, '服务暂时不可用');
    await seedHistoryMeeting(page, {
      transcript: '这是可用于生成纪要的转写文本',
      summary: '旧的纪要内容'
    });

    await page.click('.nav-item[data-view="history"]');
    await page.locator('.history-item .btn.btn-outline').click();

    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    await page.click('#btnRefreshSummary_seed-meeting-1');

    await expect(page.locator('#detailSummaryContent_seed-meeting-1')).toContainText('旧的纪要内容');
    await expect(page.locator('#toast')).toContainText('生成纪要失败: 服务暂时不可用');
  });

  test('should transcribe recovered recording from the recovery dialog', async ({ page }) => {
    await configureApiSettings(page);
    await showRecoveryDialogWithMocks(page, { processResult: 'transcribe' });

    await expect(page.locator('#recoveryModal')).toHaveClass(/active/);
    await page.click('#btnTranscribeRecovery');

    await expect(page.locator('#subtitleContent')).toContainText('这是恢复录音的转写结果');
    await expect(page.locator('#summaryContent')).toContainText('这是恢复录音的纪要结果');
    await expect(page.locator('#toast')).toContainText(/会议记录已保存|转写完成|纪要生成成功/);

    await page.click('.nav-item[data-view="history"]');
    await expect(page.locator('.history-item')).toHaveCount(1);
  });

  test('should delete recovery data from the recovery dialog', async ({ page }) => {
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await showRecoveryDialogWithMocks(page, { processResult: 'delete' });

    await expect(page.locator('#recoveryModal')).toHaveClass(/active/);
    await page.click('#btnDeleteRecovery');

    await expect(page.locator('#toast')).toContainText('已删除未完成的录音');
    await expect(page.locator('#recoveryModal')).not.toHaveClass(/active/);
    await expect.poll(async () => page.evaluate(() => window.__recoveryCleared)).toBe(true);
  });

  test('should switch language to English and keep it after reload', async ({ page }) => {
    await expect(page.locator('.nav-item[data-view="recorder"]')).toContainText('录音');
    await expect(page.locator('h1[data-i18n="appTitle"]')).toContainText('自动会议纪要');

    await page.click('#langToggle');

    await expect(page.locator('.nav-item[data-view="recorder"]')).toContainText('Record');
    await expect(page.locator('.nav-item[data-view="history"]')).toContainText('History');
    await expect(page.locator('.nav-item[data-view="settings"]')).toContainText('Settings');
    await expect(page.locator('h1[data-i18n="appTitle"]')).toContainText('Auto Meeting Minutes');
    await expect(page.locator('#btnStartRecording')).toContainText('Start Recording');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.nav-item[data-view="recorder"]')).toContainText('Record');
    await expect(page.locator('h1[data-i18n="appTitle"]')).toContainText('Auto Meeting Minutes');
    await expect(page.locator('#btnStartRecording')).toContainText('Start Recording');
  });
});
