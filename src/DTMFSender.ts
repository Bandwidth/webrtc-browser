class DTMFSender {
    private _outputStreamNode: MediaStreamAudioDestinationNode;
    private _outputStream: MediaStream;
    private _source: MediaStreamAudioSourceNode;
    private _f1Oscillator: OscillatorNode;
    private _f2Oscillator: OscillatorNode;
    private _duration: number = 100;
    private _interToneGap: number = 70;
    private _toneBuffer: string = "";
    private _playing: boolean = false;

    private _freq: Map<string, Array<number>> = new Map([
        ["1", [ 1209, 697 ]],
        ["2", [ 1336, 697 ]],
        ["3", [ 1477, 697 ]],
        ["a", [ 1633, 697 ]],
        ["4", [ 1209, 770 ]],
        ["5", [ 1336, 770 ]],
        ["6", [ 1477, 770 ]],
        ["b", [ 1633, 770 ]],
        ["7", [ 1209, 852 ]],
        ["8", [ 1336, 852 ]],
        ["9", [ 1477, 852 ]],
        ["c", [ 1633, 852 ]],
        ["*", [ 1209, 941 ]],
        ["0", [ 1336, 941 ]],
        ["#", [ 1477, 941 ]],
        ["d", [ 1633, 941 ]]
    ]);
    constructor (senderOrStream: RTCRtpSender) {
        var ctx = new AudioContext();
        this._outputStreamNode = ctx.createMediaStreamDestination();
        this._outputStream = this._outputStreamNode.stream;

        if (senderOrStream.track) {
            var inputStream: any = new MediaStream([senderOrStream.track]);
            var rtpSender: any = senderOrStream;
        } 
        else {
            var inputStream: any = senderOrStream;
            this._outputStream = this._outputStream;
            var rtpSender:any = null;
        }

        this._source = ctx.createMediaStreamSource(inputStream);
        this._source.connect(this._outputStreamNode);

        this._f1Oscillator = ctx.createOscillator();
        this._f1Oscillator.connect(this._outputStreamNode);
        this._f1Oscillator.frequency.value = 0;
        this._f1Oscillator.start(0);

        this._f2Oscillator = ctx.createOscillator();
        this._f2Oscillator.connect(this._outputStreamNode);
        this._f2Oscillator.frequency.value = 0;
        this._f2Oscillator.start(0);
        if (rtpSender) {
            rtpSender.replaceTrack(this._outputStream.getAudioTracks()[0]);
        }
        return this;
    }

    ontonechange = () => {};

    get duration() {
        return this._duration;
    };

    get interToneGap() {
        return this._interToneGap;
    };

    get toneBuffer() {
        return this._toneBuffer;
    };

    insertDTMF(tones: string, duration: number, interToneGap: number) {
        if (/[^0-9a-d#\*,]/i.test(tones)) {
        throw(new Error("InvalidCharacterError"));
        }

        this._duration = Math.min(6000, Math.max(40, duration || 100));
        this._interToneGap = Math.max(40, interToneGap || 70);
        this._toneBuffer = tones;
        console.log("tones = " + tones);

        if (!this._playing) {
            setTimeout(this._playNextTone.bind(this), 0);
            this._playing = true;
        }
    };

    _playNextTone() {
        if (this._toneBuffer.length == 0) {
            this._playing = false;
            this._f1Oscillator.frequency.value = 0;
            this._f2Oscillator.frequency.value = 0;
            return;
        }

        var digit: string = this._toneBuffer.substr(0,1);
        this._toneBuffer = this._toneBuffer.substr(1);

        if (digit == ',') {
            setTimeout(this._playNextTone.bind(this), 2000);
            return;
        }

        var f = this._freq.get(digit.toLowerCase());
        if (f) {
            this._f1Oscillator.frequency.value = f[0];
            this._f2Oscillator.frequency.value = f[1];
            setTimeout(this._stopTone.bind(this), this._duration);
        } else {
            setTimeout(this._playNextTone.bind(this), 0);
        }
    };

    _stopTone() {
        this._f1Oscillator.frequency.value = 0;
        this._f2Oscillator.frequency.value = 0;
        setTimeout(this._playNextTone.bind(this), this._interToneGap);
    }
};

export default DTMFSender;
