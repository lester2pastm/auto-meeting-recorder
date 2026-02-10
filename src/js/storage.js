const DB_NAME = 'MeetingMinutesDB';
const DB_VERSION = 2;
const STORE_NAME = 'meetings';
const SETTINGS_STORE_NAME = 'settings';

let db = null;

// 检测是否在 Electron 环境中
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

// 生成音频文件名（根据时间）
function generateAudioFilename() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}_${time}.webm`;
}

// 保存音频文件（Electron 环境）
async function saveAudioFile(audioBlob) {
  console.log('[Storage] saveAudioFile called, isElectron:', isElectron());
  
  if (!isElectron()) {
    console.log('[Storage] Not in Electron environment');
    return { success: false, error: 'Not in Electron environment' };
  }

  const filename = generateAudioFilename();
  console.log('[Storage] Generated filename:', filename);
  console.log('[Storage] Audio blob size:', audioBlob.size, 'type:', audioBlob.type);
  
  try {
    // 将 Blob 转换为 ArrayBuffer，然后转换为普通数组
    const arrayBuffer = await audioBlob.arrayBuffer();
    console.log('[Storage] ArrayBuffer created, size:', arrayBuffer.byteLength);
    
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log('[Storage] Uint8Array created, length:', uint8Array.length);
    
    const array = Array.from(uint8Array);
    console.log('[Storage] Array created, length:', array.length);
    
    console.log('[Storage] Calling electronAPI.saveAudio...');
    const result = await window.electronAPI.saveAudio(array, filename);
    console.log('[Storage] saveAudio result:', result);
    
    return result;
  } catch (error) {
    console.error('[Storage] saveAudioFile error:', error);
    return { success: false, error: error.message };
  }
}

// 获取音频文件（Electron 环境）
async function getAudioFile(filename) {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  const result = await window.electronAPI.getAudio(filename);
  if (result.success) {
    // 将数组转换回 Uint8Array，然后创建 Blob
    const uint8Array = new Uint8Array(result.data);
    result.blob = new Blob([uint8Array], { type: 'audio/webm' });
  }
  return result;
}

// 删除音频文件（Electron 环境）
async function deleteAudioFile(filename) {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  return await window.electronAPI.deleteAudio(filename);
}

// 导出音频文件（Electron 环境）
async function exportAudioFile(filename, defaultPath) {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  return await window.electronAPI.exportAudio(filename, defaultPath);
}

// 获取音频目录路径
async function getAudioDirectory() {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  return await window.electronAPI.getAudioDirectory();
}

// 保存配置到文件系统
async function saveConfigToFile(config) {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  return await window.electronAPI.saveConfig(config);
}

// 从文件系统加载配置
async function loadConfigFromFile() {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  return await window.electronAPI.loadConfig();
}

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open database'));
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('date', 'date', { unique: false });
            }
            if (!database.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
                database.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveMeeting(meeting) {
    console.log('[Storage] saveMeeting called, meeting id:', meeting.id);
    return new Promise(async (resolve, reject) => {
        try {
            // 如果有音频文件且是 Blob，保存到文件系统
            if (meeting.audioFile && meeting.audioFile instanceof Blob && isElectron()) {
                console.log('[Storage] Meeting has audioFile Blob, saving to filesystem...');
                const audioResult = await saveAudioFile(meeting.audioFile);
                console.log('[Storage] Audio save result:', audioResult);
                if (audioResult.success) {
                    // 保存文件名而不是 Blob
                    meeting.audioFilename = audioResult.filePath.split('\\').pop();
                    console.log('[Storage] Audio saved, filename:', meeting.audioFilename);
                } else {
                    console.error('[Storage] Failed to save audio file:', audioResult.error);
                }
                // 无论成功与否，都删除 Blob 以避免 IndexedDB 存储问题
                delete meeting.audioFile;
            } else if (meeting.audioFile && meeting.audioFile instanceof Blob) {
                console.log('[Storage] Non-electron environment, removing audioFile Blob');
                // 非 Electron 环境，删除 Blob 以避免 IndexedDB 存储问题
                delete meeting.audioFile;
            }

            console.log('[Storage] Saving meeting to IndexedDB...');
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.put(meeting);

            request.onsuccess = () => {
                console.log('[Storage] Meeting saved to IndexedDB successfully');
                resolve(meeting);
            };

            request.onerror = (event) => {
                console.error('[Storage] IndexedDB save error:', event.target.error);
                reject(new Error('Failed to save meeting: ' + (event.target.error ? event.target.error.message : 'Unknown error')));
            };
            
            transaction.onerror = (event) => {
                console.error('[Storage] IndexedDB transaction error:', event.target.error);
            };
        } catch (error) {
            console.error('[Storage] saveMeeting catch error:', error);
            reject(error);
        }
    });
}

function getMeeting(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.get(id);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error('Failed to get meeting'));
        };
    });
}

function getAllMeetings() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error('Failed to get all meetings'));
        };
    });
}

function deleteMeeting(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to delete meeting'));
        };
    });
}

function saveSettings(settings) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = objectStore.put({ id: 'config', ...settings });

        request.onsuccess = () => {
            resolve(settings);
        };

        request.onerror = () => {
            reject(new Error('Failed to save settings'));
        };
    });
}

function getSettings() {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
            resolve(null);
            return;
        }

        const transaction = db.transaction([SETTINGS_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = objectStore.get('config');

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(new Error('Failed to get settings'));
        };
    });
}
