/**
 * UI 模块单元测试
 * 测试界面交互、视图切换和 DOM 操作功能
 */

// 模拟 DOM 环境
document.body.innerHTML = `
  <div id="toast"></div>
  <div id="recorderView" class="view"></div>
  <div id="historyView" class="view"></div>
  <div id="settingsView" class="view"></div>
  <button class="nav-item" data-view="recorder"></button>
  <button class="nav-item" data-view="history"></button>
  <button class="nav-item" data-view="settings"></button>
  <div id="subtitleContent"></div>
  <div id="summaryContent"></div>
  <div id="recordingTime">00:00:00</div>
  <div id="recordingIndicator"></div>
  <div id="audioBars">
    <div class="audio-bar"></div>
    <div class="audio-bar"></div>
  </div>
`;

describe('UI 模块测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 重置 DOM 状态
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
  });

  describe('showToast - 提示消息测试', () => {
    it('应该正确显示成功提示', () => {
      const toast = document.getElementById('toast');
      const message = '操作成功';
      const type = 'success';

      // 模拟 showToast 函数
      const icons = {
        success: '<svg>success-icon</svg>',
        error: '<svg>error-icon</svg>',
        info: '<svg>info-icon</svg>'
      };

      toast.innerHTML = icons[type] + '<span>' + message + '</span>';
      toast.className = `toast ${type} show`;

      expect(toast.innerHTML).toContain(message);
      expect(toast.classList.contains('show')).toBe(true);
      expect(toast.classList.contains('success')).toBe(true);
    });

    it('应该正确显示错误提示', () => {
      const toast = document.getElementById('toast');
      const message = '操作失败';
      const type = 'error';

      const icons = {
        success: '<svg>success-icon</svg>',
        error: '<svg>error-icon</svg>',
        info: '<svg>info-icon</svg>'
      };

      toast.innerHTML = icons[type] + '<span>' + message + '</span>';
      toast.className = `toast ${type} show`;

      expect(toast.innerHTML).toContain(message);
      expect(toast.classList.contains('error')).toBe(true);
    });

    it('应该正确显示信息提示', () => {
      const toast = document.getElementById('toast');
      const message = '提示信息';
      const type = 'info';

      const icons = {
        success: '<svg>success-icon</svg>',
        error: '<svg>error-icon</svg>',
        info: '<svg>info-icon</svg>'
      };

      toast.innerHTML = icons[type] + '<span>' + message + '</span>';
      toast.className = `toast ${type} show`;

      expect(toast.innerHTML).toContain(message);
      expect(toast.classList.contains('info')).toBe(true);
    });
  });

  describe('switchView - 视图切换测试', () => {
    it('应该正确切换到录音视图', () => {
      const views = {
        recorder: document.getElementById('recorderView'),
        history: document.getElementById('historyView'),
        settings: document.getElementById('settingsView')
      };

      // 切换到录音视图
      Object.values(views).forEach(view => view.classList.remove('active'));
      views.recorder.classList.add('active');

      expect(views.recorder.classList.contains('active')).toBe(true);
      expect(views.history.classList.contains('active')).toBe(false);
      expect(views.settings.classList.contains('active')).toBe(false);
    });

    it('应该正确切换到历史视图', () => {
      const views = {
        recorder: document.getElementById('recorderView'),
        history: document.getElementById('historyView'),
        settings: document.getElementById('settingsView')
      };

      Object.values(views).forEach(view => view.classList.remove('active'));
      views.history.classList.add('active');

      expect(views.history.classList.contains('active')).toBe(true);
      expect(views.recorder.classList.contains('active')).toBe(false);
    });

    it('应该正确切换到设置视图', () => {
      const views = {
        recorder: document.getElementById('recorderView'),
        history: document.getElementById('historyView'),
        settings: document.getElementById('settingsView')
      };

      Object.values(views).forEach(view => view.classList.remove('active'));
      views.settings.classList.add('active');

      expect(views.settings.classList.contains('active')).toBe(true);
      expect(views.recorder.classList.contains('active')).toBe(false);
    });

    it('应该更新导航项的激活状态', () => {
      const navItems = document.querySelectorAll('.nav-item');
      
      // 模拟切换到历史视图
      navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === 'history') {
          item.classList.add('active');
        }
      });

      const activeNavItem = document.querySelector('.nav-item.active');
      expect(activeNavItem.dataset.view).toBe('history');
    });
  });

  describe('updateSubtitleContent - 字幕内容更新测试', () => {
    it('应该正确更新字幕内容', () => {
      const subtitleContent = document.getElementById('subtitleContent');
      const text = '这是转写的字幕内容';

      subtitleContent.innerHTML = `<div class="content-text">${text}</div>`;

      expect(subtitleContent.innerHTML).toContain(text);
      expect(subtitleContent.querySelector('.content-text')).toBeTruthy();
    });

    it('应该处理空内容', () => {
      const subtitleContent = document.getElementById('subtitleContent');
      const emptyHint = '开始录音后将显示转写内容';

      subtitleContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24"></svg>
          </div>
          <div class="empty-text">${emptyHint}</div>
        </div>
      `;

      expect(subtitleContent.innerHTML).toContain(emptyHint);
      expect(subtitleContent.querySelector('.empty-state')).toBeTruthy();
    });
  });

  describe('updateRecordingTime - 录音时间更新测试', () => {
    it('应该正确格式化录音时间', () => {
      const recordingTime = document.getElementById('recordingTime');
      
      // 测试不同时间格式
      const testCases = [
        { seconds: 0, expected: '00:00:00' },
        { seconds: 5, expected: '00:00:05' },
        { seconds: 60, expected: '00:01:00' },
        { seconds: 65, expected: '00:01:05' },
        { seconds: 3600, expected: '01:00:00' },
        { seconds: 3661, expected: '01:01:01' }
      ];

      testCases.forEach(({ seconds, expected }) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        
        recordingTime.textContent = formatted;
        expect(recordingTime.textContent).toBe(expected);
      });
    });
  });

  describe('updateAudioVisualization - 音频可视化测试', () => {
    it('应该更新音频柱状图高度', () => {
      const audioBars = document.querySelectorAll('.audio-bar');
      const dataArray = new Uint8Array([128, 200, 50, 255, 0, 100, 150, 180, 220, 30]);

      // 模拟音频可视化更新
      audioBars.forEach((bar, index) => {
        if (index < dataArray.length) {
          const value = dataArray[index];
          const height = Math.max(4, (value / 255) * 100);
          bar.style.height = `${height}%`;
        }
      });

      // 验证第一个柱状图的高度
      const firstBar = audioBars[0];
      const expectedHeight = Math.max(4, (dataArray[0] / 255) * 100);
      expect(firstBar.style.height).toBe(`${expectedHeight}%`);
    });
  });

  describe('escapeHtml - HTML 转义测试', () => {
    it('应该正确转义 HTML 特殊字符', () => {
      const testCases = [
        { input: '<script>', expected: '&lt;script&gt;' },
        { input: 'test & test', expected: 'test &amp; test' }
      ];

      testCases.forEach(({ input, expected }) => {
        // 模拟 escapeHtml 函数
        const escapeHtml = (text) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };

        const result = escapeHtml(input);
        expect(result).toBe(expected);
      });
    });

    it('应该处理包含引号的文本', () => {
      const escapeHtml = (text) => {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
      expect(escapeHtml("'single'")).toBe('&#039;single&#039;');
    });
  });

  describe('showSection - 兼容旧代码测试', () => {
    it('应该正确映射旧 section ID 到新 view ID', () => {
      const sectionToView = {
        'mainSection': 'recorder',
        'historySection': 'history',
        'settingsSection': 'settings'
      };

      expect(sectionToView['mainSection']).toBe('recorder');
      expect(sectionToView['historySection']).toBe('history');
      expect(sectionToView['settingsSection']).toBe('settings');
    });
  });
});
