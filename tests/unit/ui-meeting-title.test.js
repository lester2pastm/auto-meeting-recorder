describe('meeting title UI rendering', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="toast"></div>
      <div id="historyList"></div>
      <div id="detailContent"></div>
    `;
    global.i18n = null;
    window.electronAPI = undefined;
    global.getAudioFile = jest.fn();
    global.exportAudioFile = jest.fn();
    global.URL.createObjectURL = jest.fn(() => 'blob:test-audio');
    global.URL.revokeObjectURL = jest.fn();

    require('../../src/js/meeting-title');
  });

  test('renderHistoryList shows stored title and truncated title text', () => {
    const ui = require('../../src/js/ui');

    ui.renderHistoryList([{
      id: 'meeting-1',
      title: '自动会议标题功能实施方案对齐讨论记录',
      date: '2026-04-28T14:32:15',
      duration: '00:30:00'
    }]);

    const titleNode = document.querySelector('.history-item-title');
    expect(titleNode).not.toBeNull();
    expect(titleNode.textContent).toBe('自动会议标题功能实施方案对齐讨...');
    expect(titleNode.getAttribute('title')).toBe('自动会议标题功能实施方案对齐讨论记录');
  });

  test('renderHistoryList uses fallback title for historical meetings without title', () => {
    const ui = require('../../src/js/ui');

    ui.renderHistoryList([{
      id: 'meeting-2',
      date: '2026-04-28T14:32:15',
      duration: '00:30:00'
    }]);

    const titleNode = document.querySelector('.history-item-title');
    expect(titleNode).not.toBeNull();
    expect(titleNode.textContent).toBe('未命名会议 2026-04-2...');
    expect(titleNode.getAttribute('title')).toBe('未命名会议 2026-04-28 14:32');
  });

  test('renderMeetingDetail shows title in modal header', async () => {
    const ui = require('../../src/js/ui');

    await ui.renderMeetingDetail({
      id: 'meeting-3',
      title: '研发周例会',
      date: '2026-04-28T14:32:15',
      duration: '00:30:00',
      transcript: '转写',
      summary: '纪要'
    });

    const detailTitle = document.getElementById('detailMeetingTitle');
    expect(detailTitle).not.toBeNull();
    expect(detailTitle.textContent).toContain('研发周例会');
    expect(detailTitle.getAttribute('title')).toBe('研发周例会');
  });
});
