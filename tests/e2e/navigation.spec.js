/**
 * E2E 测试 - 导航和视图切换
 * 测试用户界面导航功能
 */

const { test, expect } = require('@playwright/test');

test.describe('导航功能测试', () => {
  test.beforeEach(async ({ page }) => {
    // 访问应用
    await page.goto('http://localhost:3000');
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
  });

  test('应该显示侧边栏导航', async ({ page }) => {
    // 检查侧边栏是否存在
    const sidebar = await page.locator('.sidebar');
    await expect(sidebar).toBeVisible();

    // 检查导航项
    const navItems = await page.locator('.nav-item');
    await expect(navItems).toHaveCount(3);

    // 检查导航项文本
    await expect(page.locator('.nav-item[data-view="recorder"]')).toContainText('录音');
    await expect(page.locator('.nav-item[data-view="history"]')).toContainText('历史');
    await expect(page.locator('.nav-item[data-view="settings"]')).toContainText('设置');
  });

  test('应该切换到历史视图', async ({ page }) => {
    // 点击历史导航项
    await page.click('.nav-item[data-view="history"]');

    // 检查历史视图是否激活
    const historyView = await page.locator('#historyView');
    await expect(historyView).toHaveClass(/active/);

    // 检查录音视图是否不再激活
    const recorderView = await page.locator('#recorderView');
    await expect(recorderView).not.toHaveClass(/active/);

    // 检查导航项激活状态
    const historyNav = await page.locator('.nav-item[data-view="history"]');
    await expect(historyNav).toHaveClass(/active/);
  });

  test('应该切换到设置视图', async ({ page }) => {
    // 点击设置导航项
    await page.click('.nav-item[data-view="settings"]');

    // 检查设置视图是否激活
    const settingsView = await page.locator('#settingsView');
    await expect(settingsView).toHaveClass(/active/);

    // 检查设置表单元素是否存在
    await expect(page.locator('#sttApiUrl')).toBeVisible();
    await expect(page.locator('#sttApiKey')).toBeVisible();
    await expect(page.locator('#summaryApiUrl')).toBeVisible();
    await expect(page.locator('#summaryApiKey')).toBeVisible();
  });

  test('应该切换回录音视图', async ({ page }) => {
    // 先切换到设置视图
    await page.click('.nav-item[data-view="settings"]');
    
    // 再切换回录音视图
    await page.click('.nav-item[data-view="recorder"]');

    // 检查录音视图是否激活
    const recorderView = await page.locator('#recorderView');
    await expect(recorderView).toHaveClass(/active/);

    // 检查录音控制按钮是否存在
    await expect(page.locator('#btnStartRecording')).toBeVisible();
  });
});

test.describe('录音视图功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该显示录音控制按钮', async ({ page }) => {
    // 检查开始录音按钮
    const startBtn = await page.locator('#btnStartRecording');
    await expect(startBtn).toBeVisible();

    // 检查音频可视化区域
    const audioBars = await page.locator('#audioBars');
    await expect(audioBars).toBeVisible();

    // 检查录音时间显示
    const recordingTime = await page.locator('#recordingTime');
    await expect(recordingTime).toBeVisible();
    await expect(recordingTime).toHaveText('00:00:00');
  });

  test('应该显示字幕和摘要区域', async ({ page }) => {
    // 检查字幕内容区域
    const subtitleContent = await page.locator('#subtitleContent');
    await expect(subtitleContent).toBeVisible();

    // 检查摘要内容区域
    const summaryContent = await page.locator('#summaryContent');
    await expect(summaryContent).toBeVisible();
  });
});

test.describe('设置视图功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.click('.nav-item[data-view="settings"]');
  });

  test('应该能够输入 API 配置', async ({ page }) => {
    // 填写语音识别 API 配置
    await page.fill('#sttApiUrl', 'https://api.openai.com/v1/audio/transcriptions');
    await page.fill('#sttApiKey', 'test-api-key');
    await page.fill('#sttModel', 'whisper-1');

    // 填写摘要生成 API 配置
    await page.fill('#summaryApiUrl', 'https://api.openai.com/v1/chat/completions');
    await page.fill('#summaryApiKey', 'test-api-key');
    await page.fill('#summaryModel', 'gpt-3.5-turbo');

    // 验证输入值
    await expect(page.locator('#sttApiUrl')).toHaveValue('https://api.openai.com/v1/audio/transcriptions');
    await expect(page.locator('#sttApiKey')).toHaveValue('test-api-key');
  });

  test('应该显示测试连接按钮', async ({ page }) => {
    // 检查测试按钮是否存在
    await expect(page.locator('#btnTestSttApi')).toBeVisible();
    await expect(page.locator('#btnTestSummaryApi')).toBeVisible();
    await expect(page.locator('#btnSaveTemplate')).toBeVisible();
  });
});

test.describe('历史视图功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.click('.nav-item[data-view="history"]');
  });

  test('应该显示会议历史列表', async ({ page }) => {
    // 检查历史列表容器
    const historyList = await page.locator('#historyList');
    await expect(historyList).toBeVisible();
  });

});

test.describe('语言切换功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该显示语言切换按钮', async ({ page }) => {
    const langToggle = await page.locator('#langToggle');
    await expect(langToggle).toBeVisible();
  });
});
