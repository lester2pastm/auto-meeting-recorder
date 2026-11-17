async function transcribeLocalAudio(audioBlob, audioFilePath) {
    const api = window.electronAPI;
    if (api.localAsrFileDecoder && audioFilePath) {
        return await api.transcribeLocalFile(audioFilePath);
    }

    let started = false;
    try {
        const rate = 16000;
        const decoder = new OfflineAudioContext(1, 1, rate);
        const audio = await decoder.decodeAudioData(await audioBlob.arrayBuffer());
        const ready = await api.startLocalAsr(rate);
        if (!ready.success) return ready;
        started = true;

        const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
        for (let offset = 0; offset < audio.length; offset += rate) {
            const samples = new Float32Array(Math.min(rate, audio.length - offset));
            for (const channel of channels) {
                for (let i = 0; i < samples.length; i++) samples[i] += channel[offset + i] / channels.length;
            }
            if (!(await api.writeLocalAsr(samples))) break;
        }
        return (await api.finishLocalAsr()) || { success: false, message: 'Local transcription stopped' };
    } catch (error) {
        if (started) await api.cancelLocalAsr();
        return { success: false, message: error.message };
    }
}
