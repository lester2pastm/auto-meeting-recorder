
// const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Exit Protection Logic', () => {
    let mockElectronAPI;
    let checkRecordingStatusCallback;
    let isRecording = false;

    // Mock functions to replicate app.js logic
    function setupAppControl() {
        if (window.electronAPI && window.electronAPI.onCheckRecordingStatus) {
            window.electronAPI.onCheckRecordingStatus((callback) => {
                // In real app, this is ipcRenderer.on, which takes (event, args). 
                // Our mock below just calls the callback.
                // But wait, the app.js code: window.electronAPI.onCheckRecordingStatus(() => { ... })
                // It registers a callback.
                checkRecordingStatusCallback = () => {
                     if (isRecording) {
                        showExitConfirmModal();
                    } else {
                        window.electronAPI.forceClose();
                    }
                };
            });
        }
    }

    function showExitConfirmModal() {
        const modal = document.getElementById('exitConfirmModal');
        if (!modal) return;
        
        modal.classList.add('active');
        
        const btnCancel = document.getElementById('btnCancelExit');
        const btnConfirm = document.getElementById('btnConfirmExit');
        const btnClose = document.getElementById('btnCloseExitModal');
        const overlay = document.getElementById('exitConfirmOverlay');
    
        const closeModal = () => {
            modal.classList.remove('active');
        };
    
        const handleConfirm = () => {
            closeModal();
            if (window.electronAPI && window.electronAPI.forceClose) {
                window.electronAPI.forceClose();
            }
        };
        
        if (btnCancel) btnCancel.onclick = closeModal;
        if (btnClose) btnClose.onclick = closeModal;
        if (overlay) overlay.onclick = closeModal;
        if (btnConfirm) btnConfirm.onclick = handleConfirm;
    }

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = `
            <div id="exitConfirmModal" class="modal">
                <div class="modal-overlay" id="exitConfirmOverlay"></div>
                <div class="modal-content">
                    <button id="btnCancelExit">Cancel</button>
                    <button id="btnConfirmExit">Confirm</button>
                    <button id="btnCloseExitModal">Close</button>
                </div>
            </div>
        `;

        // Mock Electron API
        mockElectronAPI = {
            onCheckRecordingStatus: jest.fn((cb) => {
                // Store the callback to trigger it manually
                // In app.js: window.electronAPI.onCheckRecordingStatus(() => { ... })
                // The preload defines: onCheckRecordingStatus: (callback) => ipcRenderer.on(..., callback)
                // So the callback passed to onCheckRecordingStatus is the one we want to trigger.
                // But in the test setupAppControl above, I'm assigning it to checkRecordingStatusCallback variable.
                // Correct behavior of setupAppControl is to PASS the callback to window.electronAPI.onCheckRecordingStatus.
                // So my mock implementation of setupAppControl is slightly wrong for testing interactions.
                // Let's fix setupAppControl to be identical to app.js, and mock window.electronAPI.onCheckRecordingStatus to capture the callback.
            }),
            forceClose: jest.fn()
        };
        window.electronAPI = mockElectronAPI;
        
        // Fix setupAppControl to use the captured callback
        // Actually, let's redefine setupAppControl to be exactly what's in app.js
        // But we need to mock getRecordingState
        global.getRecordingState = jest.fn(() => ({ isRecording }));
    });

    // Redefine setupAppControl to match app.js (simplified for test context)
    function realSetupAppControl() {
        if (window.electronAPI && window.electronAPI.onCheckRecordingStatus) {
            window.electronAPI.onCheckRecordingStatus(() => {
                const state = global.getRecordingState();
                if (state.isRecording) {
                    showExitConfirmModal();
                } else {
                    window.electronAPI.forceClose();
                }
            });
        }
    }

    it('should force close immediately if not recording', () => {
        isRecording = false;
        realSetupAppControl();
        
        // Trigger the event
        const callback = mockElectronAPI.onCheckRecordingStatus.mock.calls[0][0];
        callback();

        expect(mockElectronAPI.forceClose).toHaveBeenCalled();
        const modal = document.getElementById('exitConfirmModal');
        expect(modal.classList.contains('active')).toBe(false);
    });

    it('should show modal if recording', () => {
        isRecording = true;
        realSetupAppControl();
        
        // Trigger the event
        const callback = mockElectronAPI.onCheckRecordingStatus.mock.calls[0][0];
        callback();

        expect(mockElectronAPI.forceClose).not.toHaveBeenCalled();
        const modal = document.getElementById('exitConfirmModal');
        expect(modal.classList.contains('active')).toBe(true);
    });

    it('should close modal on cancel', () => {
        isRecording = true;
        realSetupAppControl();
        const callback = mockElectronAPI.onCheckRecordingStatus.mock.calls[0][0];
        callback();

        const btnCancel = document.getElementById('btnCancelExit');
        const modal = document.getElementById('exitConfirmModal');
        
        expect(modal.classList.contains('active')).toBe(true);
        btnCancel.click();
        expect(modal.classList.contains('active')).toBe(false);
        expect(mockElectronAPI.forceClose).not.toHaveBeenCalled();
    });

    it('should force close on confirm exit', () => {
        isRecording = true;
        realSetupAppControl();
        const callback = mockElectronAPI.onCheckRecordingStatus.mock.calls[0][0];
        callback();

        const btnConfirm = document.getElementById('btnConfirmExit');
        btnConfirm.click();
        
        expect(mockElectronAPI.forceClose).toHaveBeenCalled();
        const modal = document.getElementById('exitConfirmModal');
        expect(modal.classList.contains('active')).toBe(false);
    });
});
