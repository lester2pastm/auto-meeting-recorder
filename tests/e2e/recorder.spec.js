/**
 * E2E 测试 - 录音功能
 * 测试录音流程和用户交互
 */

const { test, expect } = require('@playwright/test');

test.describe('录音功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该显示初始录音界面', async ({ page }) => {
    // 检查开始录音按钮
    const startBtn = await page.locator('#btnStartRecording');
    await expect(startBtn).toBeVisible();

    // 检查初始时间显示
    const recordingTime = await page.locator('#recordingTime');
    await expect(recordingTime).toHaveText('00:00:00');

    // 检查录音状态指示器
    const recordingIndicator = await page.locator('#recordingIndicator');
    await expect(recordingIndicator).toBeVisible();
  });

  test('录音控制按钮应该存在', async ({ page }) => {
    // 检查开始录音按钮
    const startBtn = await page.locator('#btnStartRecording');
    await expect(startBtn).toBeVisible();

    // 检查暂停按钮存在（可能隐藏）
    const pauseBtn = await page.locator('#btnPauseRecording');
    await expect(pauseBtn).toBeAttached();

    // 检查停止按钮存在（可能隐藏）
    const stopBtn = await page.locator('#btnStopRecording');
    await expect(stopBtn).toBeAttached();
  });

  test('应该显示音频可视化效果', async ({ page }) => {
    // 检查音频柱状图容器
    const audioBars = await page.locator('#audioBars');
    await expect(audioBars).toBeVisible();

    // 检查音频柱状图数量
    const bars = await page.locator('.audio-bar');
    await expect(bars).toHaveCount(20);
  });
});

test.describe('字幕和摘要功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该显示字幕内容区域', async ({ page }) => {
    const subtitleContent = await page.locator('#subtitleContent');
    await expect(subtitleContent).toBeVisible();
  });

  test('应该显示摘要内容区域', async ({ page }) => {
    const summaryContent = await page.locator('#summaryContent');
    await expect(summaryContent).toBeVisible();
  });

  test('应该显示复制按钮', async ({ page }) => {
    // 检查复制字幕按钮
    const copySubtitleBtn = await page.locator('#btnCopySubtitle');
    await expect(copySubtitleBtn).toBeVisible();

    // 检查复制摘要按钮
    const copySummaryBtn = await page.locator('#btnCopySummary');
    await expect(copySummaryBtn).toBeVisible();
  });
});

test.describe('响应式布局测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该在大屏幕上正确显示侧边栏布局', async ({ page }) => {
    // 设置大屏幕尺寸
    await page.setViewportSize({ width: 1400, height: 900 });

    // 检查侧边栏是否可见
    const sidebar = await page.locator('.sidebar');
    await expect(sidebar).toBeVisible();

    // 检查主内容区域
    const main = await page.locator('.main');
    await expect(main).toBeVisible();
  });

  test('应该在小屏幕上调整布局', async ({ page }) => {
    // 设置小屏幕尺寸
    await page.setViewportSize({ width: 768, height: 600 });

    // 页面应该仍然可以正常显示
    const app = await page.locator('.app');
    await expect(app).toBeVisible();
  });
});

test.describe('Toast 提示功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('应该能够显示 Toast 提示', async ({ page }) => {
    // 触发一个 Toast（例如，点击复制按钮而不选择内容）
    await page.click('#btnCopySubtitle');

    // 检查 Toast 是否显示
    const toast = await page.locator('#toast');
    await expect(toast).toBeVisible();
  });
});
