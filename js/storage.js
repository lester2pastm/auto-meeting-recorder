const DB_NAME = 'MeetingMinutesDB';
const DB_VERSION = 2;
const STORE_NAME = 'meetings';
const SETTINGS_STORE_NAME = 'settings';

let db = null;

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

function saveMeeting(meeting) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.add(meeting);

        request.onsuccess = () => {
            resolve(meeting);
        };

        request.onerror = () => {
            reject(new Error('Failed to save meeting'));
        };
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
