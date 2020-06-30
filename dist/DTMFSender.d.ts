declare class DTMFSender {
    private _outputStreamNode;
    private _outputStream;
    private _gainNode;
    private _filter;
    private _source;
    private _f1Oscillator;
    private _f2Oscillator;
    private _duration;
    private _interToneGap;
    private _toneBuffer;
    private _playing;
    private _freq;
    constructor(senderOrStream: RTCRtpSender);
    ontonechange: () => void;
    get duration(): number;
    get interToneGap(): number;
    get toneBuffer(): string;
    insertDTMF(tones: string, duration: number, interToneGap: number): void;
    _playNextTone(): void;
    _stopTone(): void;
}
export default DTMFSender;
