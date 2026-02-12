/**
 * retryTranscription 单元测试
 * 测试重试转写功能的10秒限制
 */

const TranscriptionManager = require('../../src/js/transcription-manager');

// 模拟 app.js 中的函数
const mockUpdateMeeting = jest.fn();
const mockProcessRecording = jest.fn();
const mockShowToast = jest.fn();

global.updateMeeting = mockUpdateMeeting;
global.processRecording = mockProcessRecording;
global.showToast = mockShowToast;
global.TRANSCRIPT_STATUS = {
    PENDING: 'pending',
    TRANSCRIBING: 'transcribing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

describe('retryTranscription', () => {
    let transcriptionManager;
    let mockAudioBlob;
    
    // 模拟 retryTranscription 函数
    async function retryTranscription(meetingId, audioBlob) {
        if (!transcriptionManager.canTranscribe(meetingId)) {
            showToast('请等待10秒后再试', 'warning');
            return { allowed: false };
        }
        
        transcriptionManager.recordTranscriptionTime(meetingId);
        
        // 重置状态为 pending
        await updateMeeting(meetingId, { 
            transcriptStatus: TRANSCRIPT_STATUS.PENDING,
            transcript: ''
        });
        
        // 重新转写
        await processRecording(audioBlob, meetingId);
        
        return { allowed: true };
    }
    
    beforeEach(() => {
        jest.clearAllMocks();
        transcriptionManager = new TranscriptionManager();
        mockAudioBlob = new Blob(['test audio'], { type: 'audio/webm' });
    });
    
    test('首次重试应允许', async () => {
        const result = await retryTranscription('meeting-1', mockAudioBlob);
        
        expect(result.allowed).toBe(true);
        expect(mockUpdateMeeting).toHaveBeenCalledWith('meeting-1', {
            transcriptStatus: 'pending',
            transcript: ''
        });
        expect(mockProcessRecording).toHaveBeenCalledWith(mockAudioBlob, 'meeting-1');
    });
    
    test('10秒内不能重试', async () => {
        const result1 = await retryTranscription('test-1', mockAudioBlob);
        expect(result1.allowed).toBe(true);
        
        const result2 = await retryTranscription('test-1', mockAudioBlob);
        expect(result2.allowed).toBe(false);
    });
    
    test('10秒后应允许再次重试', async () => {
        const baseTime = 1000000000000;
        let currentTime = baseTime;
        
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
        
        // 第一次重试在 baseTime
        const result1 = await retryTranscription('meeting-2', mockAudioBlob);
        expect(result1.allowed).toBe(true);
        
        // 10秒后
        currentTime = baseTime + 10000;
        
        const result2 = await retryTranscription('meeting-2', mockAudioBlob);
        expect(result2.allowed).toBe(true);
        
        Date.now.mockRestore();
    });
    
    test('阻止重试时应显示警告提示', async () => {
        await retryTranscription('meeting-3', mockAudioBlob); // 第一次允许
        
        await retryTranscription('meeting-3', mockAudioBlob); // 第二次应阻止
        
        expect(mockShowToast).toHaveBeenCalledWith('请等待10秒后再试', 'warning');
    });
    
    test('不同会议应独立计时', async () => {
        const result1 = await retryTranscription('meeting-a', mockAudioBlob);
        expect(result1.allowed).toBe(true);
        
        const result2 = await retryTranscription('meeting-b', mockAudioBlob);
        expect(result2.allowed).toBe(true);
    });
    
    test('成功重试后应重置状态为 pending', async () => {
        await retryTranscription('meeting-4', mockAudioBlob);
        
        expect(mockUpdateMeeting).toHaveBeenCalledWith('meeting-4', {
            transcriptStatus: 'pending',
            transcript: ''
        });
    });
    
    test('成功重试后应调用 processRecording', async () => {
        await retryTranscription('meeting-5', mockAudioBlob);
        
        expect(mockProcessRecording).toHaveBeenCalledTimes(1);
        expect(mockProcessRecording).toHaveBeenCalledWith(mockAudioBlob, 'meeting-5');
    });
});
