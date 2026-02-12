/**
 * TranscriptionManager - 转写管理器
 * 管理每条会议记录的最后转写时间，防止频繁转写
 */

class TranscriptionManager {
    constructor(rateLimitMs = 10000) {
        this.rateLimitMs = rateLimitMs;
        this.lastTranscriptionTime = new Map();
    }
    
    /**
     * 验证 meetingId 是否有效
     * @param {*} meetingId - 会议ID
     * @private
     */
    _validateMeetingId(meetingId) {
        if (typeof meetingId !== 'string' || meetingId.trim() === '') {
            throw new Error('meetingId must be a non-empty string');
        }
    }
    
    /**
     * 检查是否可以进行转写
     * @param {string} meetingId - 会议ID
     * @returns {boolean} - 是否允许转写
     */
    canTranscribe(meetingId) {
        this._validateMeetingId(meetingId);
        const lastTime = this.lastTranscriptionTime.get(meetingId);
        if (!lastTime) return true;
        return (Date.now() - lastTime) >= this.rateLimitMs;
    }
    
    /**
     * 记录转写时间
     * @param {string} meetingId - 会议ID
     */
    recordTranscriptionTime(meetingId) {
        this._validateMeetingId(meetingId);
        this.lastTranscriptionTime.set(meetingId, Date.now());
    }
    
    /**
     * 清除指定会议的转写记录
     * @param {string} meetingId - 会议ID
     */
    clearMeeting(meetingId) {
        this._validateMeetingId(meetingId);
        this.lastTranscriptionTime.delete(meetingId);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranscriptionManager;
}
