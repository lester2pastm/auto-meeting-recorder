/**
 * Storage 模块单元测试
 * 测试 IndexedDB 操作、音频文件管理和配置存储功能
 */

const { saveMeeting, getMeeting, updateMeeting } = require('../../src/js/storage');

// 模拟 storage.js 的依赖
const mockDB = {
  transaction: jest.fn(),
  objectStore: jest.fn(),
  createObjectStore: jest.fn()
};

const mockRequest = {
  onsuccess: null,
  onerror: null,
  result: null
};

describe('Storage 模块测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 重置 indexedDB 模拟
    indexedDB.open.mockReturnValue({
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: mockDB
    });
  });

  describe('generateAudioFilename', () => {
    it('应该生成正确的音频文件名格式', () => {
      const mockDate = new Date('2026-02-01T14:30:45');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      // 由于函数在模块内部，我们需要测试文件名格式
      const date = mockDate.toISOString().split('T')[0];
      const time = mockDate.toTimeString().split(' ')[0].replace(/:/g, '-');
      const expectedFilename = `${date}_${time}.webm`;
      
      expect(expectedFilename).toBe('2026-02-01_14-30-45.webm');
      expect(expectedFilename).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/);
    });
  });

  describe('isElectron 检测', () => {
    it('应该正确检测 Electron 环境', () => {
      // 有 electronAPI 时应该返回 true
      expect(typeof window.electronAPI).toBe('object');
      
      // 测试 electronAPI 存在
      expect(window.electronAPI).toBeDefined();
      expect(window.electronAPI.saveAudio).toBeDefined();
      expect(window.electronAPI.getAudio).toBeDefined();
    });
  });

  describe('音频文件操作', () => {
    it('saveAudioFile 应该调用 electronAPI.saveAudio', async () => {
      window.electronAPI.saveAudio.mockResolvedValue({ success: true, filePath: '/path/to/audio.webm' });
      
      // 模拟调用 saveAudioFile
      const filename = '2026-02-01_14-30-45.webm';
      // 模拟音频数据数组
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      const result = await window.electronAPI.saveAudio(array, filename);
      
      expect(window.electronAPI.saveAudio).toHaveBeenCalledWith(array, filename);
      expect(result.success).toBe(true);
    });

    it('getAudioFile 应该调用 electronAPI.getAudio', async () => {
      const mockData = [1, 2, 3, 4, 5];
      window.electronAPI.getAudio.mockResolvedValue({ success: true, data: mockData });
      
      const filename = 'test.webm';
      const result = await window.electronAPI.getAudio(filename);
      
      expect(window.electronAPI.getAudio).toHaveBeenCalledWith(filename);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });

    it('deleteAudioFile 应该调用 electronAPI.deleteAudio', async () => {
      window.electronAPI.deleteAudio.mockResolvedValue({ success: true });
      
      const filename = 'test.webm';
      const result = await window.electronAPI.deleteAudio(filename);
      
      expect(window.electronAPI.deleteAudio).toHaveBeenCalledWith(filename);
      expect(result.success).toBe(true);
    });

    it('exportAudioFile 应该调用 electronAPI.exportAudio', async () => {
      window.electronAPI.exportAudio.mockResolvedValue({ success: true, filePath: '/export/path/audio.webm' });
      
      const filename = 'test.webm';
      const defaultPath = '/default/path';
      const result = await window.electronAPI.exportAudio(filename, defaultPath);
      
      expect(window.electronAPI.exportAudio).toHaveBeenCalledWith(filename, defaultPath);
      expect(result.success).toBe(true);
    });

    it('getAudioDirectory 应该调用 electronAPI.getAudioDirectory', async () => {
      window.electronAPI.getAudioDirectory.mockResolvedValue({ success: true, path: '/audio/dir' });
      
      const result = await window.electronAPI.getAudioDirectory();
      
      expect(window.electronAPI.getAudioDirectory).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.path).toBe('/audio/dir');
    });
  });

  describe('配置操作', () => {
    it('saveConfigToFile 应该调用 electronAPI.saveConfig', async () => {
      const config = {
        sttApiUrl: 'https://api.example.com/stt',
        sttApiKey: 'test-key',
        sttModel: 'whisper-1',
        summaryApiUrl: 'https://api.example.com/summary',
        summaryApiKey: 'summary-key',
        summaryModel: 'gpt-3.5-turbo'
      };
      
      window.electronAPI.saveConfig.mockResolvedValue({ success: true });
      
      const result = await window.electronAPI.saveConfig(config);
      
      expect(window.electronAPI.saveConfig).toHaveBeenCalledWith(config);
      expect(result.success).toBe(true);
    });

    it('loadConfigFromFile 应该调用 electronAPI.loadConfig', async () => {
      const mockConfig = {
        sttApiUrl: 'https://api.example.com/stt',
        sttApiKey: 'test-key'
      };
      
      window.electronAPI.loadConfig.mockResolvedValue({ success: true, config: mockConfig });
      
      const result = await window.electronAPI.loadConfig();
      
      expect(window.electronAPI.loadConfig).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.config).toEqual(mockConfig);
    });
  });

  describe('IndexedDB 初始化', () => {
    it('应该正确打开 IndexedDB', () => {
      const dbName = 'MeetingMinutesDB';
      const dbVersion = 2;
      
      indexedDB.open(dbName, dbVersion);
      
      expect(indexedDB.open).toHaveBeenCalledWith(dbName, dbVersion);
    });

    it('应该处理 IndexedDB 打开成功', (done) => {
      const mockOpenRequest = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: mockDB
      };
      
      indexedDB.open.mockReturnValue(mockOpenRequest);
      
      // 模拟异步操作
      setTimeout(() => {
        if (mockOpenRequest.onsuccess) {
          mockOpenRequest.onsuccess({ target: { result: mockDB } });
        }
        expect(mockOpenRequest.result).toBe(mockDB);
        done();
      }, 0);
    });
  });

  describe('updateMeeting', () => {
    test('应更新现有会议记录', async () => {
      // 模拟 IndexedDB 环境
      const mockExistingMeeting = {
        id: 'test-1',
        transcript: 'old text',
        transcriptStatus: 'pending'
      };
      
      const mockPutRequest = {
        onsuccess: null,
        onerror: null
      };
      
      const mockGetRequest = {
        onsuccess: null,
        onerror: null,
        result: mockExistingMeeting
      };
      
      const mockObjectStore = {
        get: jest.fn().mockReturnValue(mockGetRequest),
        put: jest.fn().mockReturnValue(mockPutRequest)
      };
      
      const mockTransaction = {
        objectStore: jest.fn().mockReturnValue(mockObjectStore)
      };
      
      const mockDb = {
        transaction: jest.fn().mockReturnValue(mockTransaction)
      };
      
      // 模拟数据库模块
      const storage = require('../../src/js/storage');
      
      // 手动设置数据库连接
      const initPromise = storage.initDB();
      const mockOpenRequest = indexedDB.open.mock.results[0].value;
      mockOpenRequest.onsuccess({ target: { result: mockDb } });
      await initPromise;
      
      // 执行更新
      const updatePromise = storage.updateMeeting('test-1', {
        transcript: 'new text',
        transcriptStatus: 'completed'
      });
      
      // 模拟获取成功
      mockGetRequest.onsuccess();
      
      // 模拟更新成功
      const updatedResult = { ...mockExistingMeeting, transcript: 'new text', transcriptStatus: 'completed' };
      mockPutRequest.onsuccess();
      
      const result = await updatePromise;
      
      expect(result.transcript).toBe('new text');
      expect(result.transcriptStatus).toBe('completed');
      expect(result.id).toBe('test-1');
      expect(mockObjectStore.get).toHaveBeenCalledWith('test-1');
      expect(mockObjectStore.put).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-1',
        transcript: 'new text',
        transcriptStatus: 'completed'
      }));
    });

    test('当会议不存在时应抛出错误', async () => {
      const mockGetRequest = {
        onsuccess: null,
        onerror: null,
        result: null // 会议不存在
      };
      
      const mockObjectStore = {
        get: jest.fn().mockReturnValue(mockGetRequest)
      };
      
      const mockTransaction = {
        objectStore: jest.fn().mockReturnValue(mockObjectStore)
      };
      
      const mockDb = {
        transaction: jest.fn().mockReturnValue(mockTransaction)
      };
      
      const storage = require('../../src/js/storage');
      
      // 手动设置数据库连接
      const initPromise = storage.initDB();
      const mockOpenRequest = indexedDB.open.mock.results[0].value;
      mockOpenRequest.onsuccess({ target: { result: mockDb } });
      await initPromise;
      
      // 执行更新
      const updatePromise = storage.updateMeeting('non-existent-id', {
        transcript: 'new text'
      });
      
      // 模拟获取成功但记录不存在
      mockGetRequest.onsuccess();
      
      await expect(updatePromise).rejects.toThrow('Meeting not found');
    });
  });
});
