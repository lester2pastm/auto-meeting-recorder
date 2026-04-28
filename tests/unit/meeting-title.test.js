const {
  buildFallbackMeetingTitle,
  truncateMeetingTitle,
  sanitizeGeneratedMeetingTitle,
  getMeetingDisplayTitle
} = require('../../src/js/meeting-title');

describe('meeting title helpers', () => {
  test('buildFallbackMeetingTitle keeps the stored meeting wall-clock time', () => {
    expect(buildFallbackMeetingTitle('2026-04-28T14:32:15.000Z')).toBe('未命名会议 2026-04-28 14:32');
  });

  test('buildFallbackMeetingTitle falls back to 未命名会议 when date is invalid', () => {
    expect(buildFallbackMeetingTitle('not-a-date')).toBe('未命名会议');
  });

  test('truncateMeetingTitle leaves short titles unchanged', () => {
    expect(truncateMeetingTitle('项目周会')).toBe('项目周会');
  });

  test('truncateMeetingTitle trims titles longer than 15 characters and appends ellipsis', () => {
    expect(truncateMeetingTitle('自动会议标题功能实施方案对齐讨论记录')).toBe('自动会议标题功能实施方案对齐讨...');
  });

  test('sanitizeGeneratedMeetingTitle removes markdown markers and wrapping quotes', () => {
    expect(sanitizeGeneratedMeetingTitle('### “项目推进同步”\n')).toBe('项目推进同步');
  });

  test('sanitizeGeneratedMeetingTitle preserves valid numeric titles', () => {
    expect(sanitizeGeneratedMeetingTitle('2026预算评审')).toBe('2026预算评审');
    expect(sanitizeGeneratedMeetingTitle('1对1沟通')).toBe('1对1沟通');
  });

  test('getMeetingDisplayTitle prefers a stored title and trims outer whitespace', () => {
    expect(getMeetingDisplayTitle({
      title: '  项目推进同步  ',
      date: '2026-04-28T14:32:15.000Z'
    })).toBe('项目推进同步');
  });

  test('getMeetingDisplayTitle falls back to date-based title when title is blank', () => {
    expect(getMeetingDisplayTitle({
      title: '   ',
      date: '2026-04-28T14:32:15.000Z'
    })).toBe('未命名会议 2026-04-28 14:32');
  });

  test('helper functions are exposed on globalThis for browser scripts', () => {
    expect(globalThis.buildFallbackMeetingTitle).toBe(buildFallbackMeetingTitle);
    expect(globalThis.truncateMeetingTitle).toBe(truncateMeetingTitle);
    expect(globalThis.sanitizeGeneratedMeetingTitle).toBe(sanitizeGeneratedMeetingTitle);
    expect(globalThis.getMeetingDisplayTitle).toBe(getMeetingDisplayTitle);
  });
});
