/**
 * TranscriptionManager 单元测试
 * 测试转写管理器的10秒限制功能
 */

const TranscriptionManager = require('../../src/js/transcription-manager');

describe('TranscriptionManager', () => {
    let manager;
    
    beforeEach(() => {
        manager = new TranscriptionManager();
    });
    
    test('首次转写应允许', () => {
        expect(manager.canTranscribe('meeting-1')).toBe(true);
    });
    
    test('10秒内重复转写应被阻止', () => {
        manager.recordTranscriptionTime('meeting-1');
        expect(manager.canTranscribe('meeting-1')).toBe(false);
    });
    
    test('10秒后应允许再次转写', () => {
        const now = Date.now();
        jest.spyOn(Date, 'now')
            .mockReturnValueOnce(now) // for recordTranscriptionTime
            .mockReturnValueOnce(now) // for canTranscribe check (immediately after)
            .mockReturnValueOnce(now + 10000); // for canTranscribe check after 10s
        
        manager.recordTranscriptionTime('meeting-1');
        expect(manager.canTranscribe('meeting-1')).toBe(false);
        expect(manager.canTranscribe('meeting-1')).toBe(true);
        
        Date.now.mockRestore();
    });
    
    test('不同会议应独立计时', () => {
        manager.recordTranscriptionTime('meeting-1');
        expect(manager.canTranscribe('meeting-2')).toBe(true);
    });
    
    test('可配置时间限制', () => {
        const customManager = new TranscriptionManager(5000);
        const now = Date.now();
        jest.spyOn(Date, 'now')
            .mockReturnValueOnce(now) // for recordTranscriptionTime
            .mockReturnValueOnce(now + 5000); // for canTranscribe check after 5s
        
        customManager.recordTranscriptionTime('meeting-1');
        expect(customManager.canTranscribe('meeting-1')).toBe(true);
        
        Date.now.mockRestore();
    });
    
    test('无效meetingId应抛出错误 - canTranscribe', () => {
        expect(() => manager.canTranscribe('')).toThrow('meetingId must be a non-empty string');
        expect(() => manager.canTranscribe(null)).toThrow('meetingId must be a non-empty string');
        expect(() => manager.canTranscribe(123)).toThrow('meetingId must be a non-empty string');
        expect(() => manager.canTranscribe(undefined)).toThrow('meetingId must be a non-empty string');
    });
    
    test('无效meetingId应抛出错误 - recordTranscriptionTime', () => {
        expect(() => manager.recordTranscriptionTime('')).toThrow('meetingId must be a non-empty string');
        expect(() => manager.recordTranscriptionTime(null)).toThrow('meetingId must be a non-empty string');
    });
    
    test('clearMeeting应清除指定会议的转写记录', () => {
        manager.recordTranscriptionTime('meeting-1');
        expect(manager.canTranscribe('meeting-1')).toBe(false);
        
        manager.clearMeeting('meeting-1');
        expect(manager.canTranscribe('meeting-1')).toBe(true);
    });
    
    test('clearMeeting无效meetingId应抛出错误', () => {
        expect(() => manager.clearMeeting('')).toThrow('meetingId must be a non-empty string');
        expect(() => manager.clearMeeting(null)).toThrow('meetingId must be a non-empty string');
    });
});
