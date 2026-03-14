describe('UI loading state targeting', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="subtitleContent"><div class="content-text">现有转写内容</div></div>
      <div id="summaryContent"><div class="content-text">现有纪要内容</div></div>
      <button id="summaryTab" class="tab-button"></button>
      <div id="summaryTabBadge"></div>
    `;
    global.i18n = null;
  });

  test('summary-only loading should not overwrite transcript content', () => {
    const ui = require('../../src/js/ui');

    expect(typeof ui.showLoading).toBe('function');

    ui.showLoading('正在生成纪要...', { summary: true, transcript: false });

    expect(document.getElementById('subtitleContent').textContent).toContain('现有转写内容');
    expect(document.getElementById('summaryContent').textContent).toContain('生成中');
  });
});
