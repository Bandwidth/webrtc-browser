"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var DTMFSender = /** @class */ (function () {
    function DTMFSender(senderOrStream) {
        this._duration = 1500;
        this._interToneGap = 70;
        this._toneBuffer = "";
        this._playing = false;
        this._freq = new Map([
            ["1", [1209, 697]],
            ["2", [1336, 697]],
            ["3", [1477, 697]],
            ["a", [1633, 697]],
            ["4", [1209, 770]],
            ["5", [1336, 770]],
            ["6", [1477, 770]],
            ["b", [1633, 770]],
            ["7", [1209, 852]],
            ["8", [1336, 852]],
            ["9", [1477, 852]],
            ["c", [1633, 852]],
            ["*", [1209, 941]],
            ["0", [1336, 941]],
            ["#", [1477, 941]],
            ["d", [1633, 941]],
        ]);
        this.ontonechange = function () { };
        var ctx = new AudioContext();
        this._outputStreamNode = ctx.createMediaStreamDestination();
        this._outputStream = this._outputStreamNode.stream;
        if (senderOrStream.track) {
            var inputStream = new MediaStream([senderOrStream.track]);
            var rtpSender = senderOrStream;
        }
        else {
            var inputStream = senderOrStream;
            this._outputStream = this._outputStream;
            var rtpSender = null;
        }
        this._source = ctx.createMediaStreamSource(inputStream);
        this._source.connect(this._outputStreamNode);
        this._f1Oscillator = ctx.createOscillator();
        this._f1Oscillator.connect(this._outputStreamNode);
        this._f1Oscillator.type = 'sine';
        this._f1Oscillator.frequency.value = 0;
        this._f1Oscillator.start(0);
        this._f2Oscillator = ctx.createOscillator();
        this._f2Oscillator.connect(this._outputStreamNode);
        this._f2Oscillator.type = 'sine';
        this._f2Oscillator.frequency.value = 0;
        this._f2Oscillator.start(0);
        this._gainNode = ctx.createGain();
        this._gainNode.gain.value = 0.25;
        this._filter = ctx.createBiquadFilter();
        this._filter.type = "lowpass";
        this._f1Oscillator.connect(this._gainNode);
        this._f2Oscillator.connect(this._gainNode);
        this._gainNode.connect(this._filter);
        this._filter.connect(ctx.destination);
        if (rtpSender) {
            rtpSender.replaceTrack(this._outputStream.getAudioTracks()[0]);
        }
        return this;
    }
    Object.defineProperty(DTMFSender.prototype, "duration", {
        get: function () {
            return this._duration;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DTMFSender.prototype, "interToneGap", {
        get: function () {
            return this._interToneGap;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DTMFSender.prototype, "toneBuffer", {
        get: function () {
            return this._toneBuffer;
        },
        enumerable: false,
        configurable: true
    });
    DTMFSender.prototype.insertDTMF = function (tones, duration, interToneGap) {
        if (/[^0-9a-d#\*,]/i.test(tones)) {
            throw new Error("InvalidCharacterError");
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
    DTMFSender.prototype._playNextTone = function () {
        if (this._toneBuffer.length == 0) {
            this._playing = false;
            this._f1Oscillator.frequency.value = 0;
            this._f2Oscillator.frequency.value = 0;
            return;
        }
        var digit = this._toneBuffer.substr(0, 1);
        this._toneBuffer = this._toneBuffer.substr(1);
        if (digit == ",") {
            setTimeout(this._playNextTone.bind(this), 2000);
            return;
        }
        var f = this._freq.get(digit.toLowerCase());
        if (f) {
            this._f1Oscillator.frequency.value = f[0];
            this._f2Oscillator.frequency.value = f[1];
            setTimeout(this._stopTone.bind(this), this._duration);
        }
        else {
            setTimeout(this._playNextTone.bind(this), 0);
        }
    };
    DTMFSender.prototype._stopTone = function () {
        this._f1Oscillator.frequency.value = 0;
        this._f2Oscillator.frequency.value = 0;
        setTimeout(this._playNextTone.bind(this), this._interToneGap);
    };
    return DTMFSender;
}());
exports.default = DTMFSender;
//# sourceMappingURL=DTMFSender.js.map