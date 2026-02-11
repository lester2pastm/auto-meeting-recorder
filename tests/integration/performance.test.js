const fs = require('fs');
const path = require('path');

describe('Recording Performance', () => {
    const testAudioDir = path.join(__dirname, '..', 'temp-audio-test');
    
    beforeAll(async () => {
        const createTestDir = path.join(__dirname, '..', 'temp-audio-test');
        if (!fs.existsSync(createTestDir)) {
            fs.mkdirSync(createTestDir, { recursive: true });
        }
    });
    
    afterAll(async () => {
        if (fs.existsSync(testAudioDir)) {
            fs.rmSync(testAudioDir, { recursive: true, force: true });
        }
    });
    
    test('memory usage should remain constant during recording', async () => {
        const chunkCount = 600;
        const chunkSize = 100 * 1024;
        const tempFile = path.join(testAudioDir, 'test_recording.webm');
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        for (let i = 0; i < chunkCount; i++) {
            const chunkData = Buffer.alloc(chunkSize, 0x00);
            fs.appendFileSync(tempFile, chunkData);
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryGrowth = finalMemory - initialMemory;
        
        expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
        
        fs.unlinkSync(tempFile);
    });
    
    test('file append operation time should be consistent', async () => {
        const tempFile = path.join(testAudioDir, 'test_append.webm');
        const chunkSize = 100 * 1024;
        const iterations = 100;
        
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
            const chunkData = Buffer.alloc(chunkSize, 0x00);
            const start = Date.now();
            fs.appendFileSync(tempFile, chunkData);
            times.push(Date.now() - start);
        }
        
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);
        
        expect(stdDev).toBeLessThan(mean * 3);
        
        fs.unlinkSync(tempFile);
    });
});
