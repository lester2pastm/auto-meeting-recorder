class LocalSpeechCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this.batch = new Float32Array(2048);
        this.length = 0;
        this.paused = false;
        this.port.onmessage = ({ data }) => {
            if (data === 'resume') {
                this.paused = false;
                return;
            }
            this.paused = true;
            this.flush();
            if (data === 'finish') this.port.postMessage('finished');
        };
    }

    flush() {
        if (this.length === 0) return;
        const samples = this.batch.subarray(0, this.length);
        this.port.postMessage(samples, [samples.buffer]);
        this.batch = new Float32Array(2048);
        this.length = 0;
    }

    process(inputs) {
        const input = inputs[0][0];
        if (!this.paused && input) {
            this.batch.set(input, this.length);
            this.length += input.length;
            if (this.length === this.batch.length) this.flush();
        }
        return true;
    }
}

registerProcessor('local-speech-capture', LocalSpeechCapture);
