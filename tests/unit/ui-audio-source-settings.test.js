document.body.innerHTML = `
  <input id="sttApiUrl" value="">
  <input id="sttApiKey" value="">
  <input id="sttModel" value="">
  <input id="summaryApiUrl" value="">
  <input id="summaryApiKey" value="">
  <input id="summaryModel" value="">
  <textarea id="summaryTemplate"></textarea>
  <select id="preferredMicSource"></select>
  <select id="preferredSystemSource"></select>
  <div id="audioSourceStatus"></div>
`;

const {
  loadSettings,
  getSettingsFromUI,
  renderAudioSourceOptions
} = require('../../src/js/ui.js');

describe('UI audio source settings', () => {
  beforeEach(() => {
    document.getElementById('preferredMicSource').innerHTML = '';
    document.getElementById('preferredSystemSource').innerHTML = '';
    document.getElementById('audioSourceStatus').textContent = '';
  });

  test('should load preferred source settings into the new selects', () => {
    renderAudioSourceOptions({
      microphoneSources: [
        { id: 'auto', label: '自动选择（推荐）' },
        { id: 'mic-1', label: 'Mic 1' }
      ],
      systemSources: [
        { id: 'auto', label: '自动选择（推荐）' },
        { id: 'sys-1', label: 'System 1' }
      ],
      selectedMicSource: 'mic-1',
      selectedSystemSource: 'sys-1',
      statusText: '已检测到 1 个麦克风源 / 1 个系统音频源'
    });

    loadSettings({
      preferredMicSource: 'mic-1',
      preferredSystemSource: 'sys-1'
    });

    expect(document.getElementById('preferredMicSource').value).toBe('mic-1');
    expect(document.getElementById('preferredSystemSource').value).toBe('sys-1');
  });

  test('should read preferred source settings from the UI', () => {
    renderAudioSourceOptions({
      microphoneSources: [
        { id: 'auto', label: '自动选择（推荐）' },
        { id: 'mic-1', label: 'Mic 1' }
      ],
      systemSources: [
        { id: 'auto', label: '自动选择（推荐）' },
        { id: 'unavailable', label: '当前不可用' }
      ],
      selectedMicSource: 'auto',
      selectedSystemSource: 'unavailable',
      statusText: '系统音频源当前不可用'
    });

    document.getElementById('preferredMicSource').value = 'mic-1';
    document.getElementById('preferredSystemSource').value = 'unavailable';

    expect(getSettingsFromUI()).toMatchObject({
      preferredMicSource: 'mic-1',
      preferredSystemSource: 'unavailable'
    });
  });

  test('should open custom dropdown and close it after selecting an option', () => {
    document.body.innerHTML = `
      <div class="custom-select" id="selectField" data-custom-select="preferredMicSource">
        <select id="preferredMicSource" class="custom-select-native">
          <option value="auto">自动选择（推荐）</option>
          <option value="mic-1">Mic 1</option>
        </select>
        <button type="button" class="custom-select-trigger" data-select-trigger="preferredMicSource">
          <span class="custom-select-label">自动选择（推荐）</span>
        </button>
        <div class="custom-select-menu" data-select-menu="preferredMicSource"></div>
      </div>
      <select id="preferredSystemSource"></select>
      <div id="audioSourceStatus"></div>
    `;

    const wrapper = document.getElementById('selectField');
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const select = document.getElementById('preferredMicSource');

    renderAudioSourceOptions({
      microphoneSources: [
        { id: 'auto', label: '自动选择（推荐）' },
        { id: 'mic-1', label: 'Mic 1' }
      ],
      systemSources: [],
      selectedMicSource: 'auto',
      selectedSystemSource: 'auto',
      statusText: ''
    });

    trigger.click();
    expect(wrapper.classList.contains('is-open')).toBe(true);

    const option = wrapper.querySelector('[data-select-option="mic-1"]');
    option.click();

    expect(select.value).toBe('mic-1');
    expect(wrapper.classList.contains('is-open')).toBe(false);
    expect(wrapper.querySelector('.custom-select-label').textContent).toBe('Mic 1');
  });
});
