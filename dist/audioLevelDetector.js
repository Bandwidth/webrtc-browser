"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var types_1 = require("./types");
var AudioLevelDetector = /** @class */ (function (_super) {
    __extends(AudioLevelDetector, _super);
    function AudioLevelDetector(config) {
        var _this = _super.call(this) || this;
        _this.start = 0;
        _this.lastEmitTime = 0;
        _this.timeThreshold = 500;
        _this.silenceAmplitudeThreshold = 0.2;
        _this.highAmplitudeThreshold = 0.5;
        _this.sampleInterval = 100; // ms
        _this.maxEmitInterval = 500; // ms;
        _this.currentAudioLevel = types_1.AudioLevel.SILENT;
        if (config.timeThreshold) {
            _this.timeThreshold = config.timeThreshold;
        }
        if (config.silenceAmplitudeThreshold) {
            _this.silenceAmplitudeThreshold = config.silenceAmplitudeThreshold;
        }
        if (config.highAmplitudeThreshold) {
            _this.highAmplitudeThreshold = config.highAmplitudeThreshold;
        }
        if (config.sampleInterval) {
            _this.sampleInterval = config.sampleInterval;
        }
        if (config.maxEmitInterval) {
            _this.maxEmitInterval = config.maxEmitInterval;
        }
        // Assigning the media stream as the srcObject of an Audio element
        // is required by Chrome in some circumstances to actually start
        // the audio flowing through the Web Audio API nodes
        new Audio().srcObject = config.mediaStream;
        var context = new AudioContext();
        var source = context.createMediaStreamSource(config.mediaStream);
        var analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        _this.analyserNode = analyser;
        setInterval(_this.analyse.bind(_this), _this.sampleInterval);
        return _this;
    }
    AudioLevelDetector.prototype.analyse = function () {
        var bufferLength = this.analyserNode.fftSize;
        var dataArray = new Uint8Array(bufferLength);
        this.analyserNode.getByteTimeDomainData(dataArray);
        // Iterate over each of the samples
        for (var i = 0; i < bufferLength; i++) {
            var sampleValue = this.normalizeSample(dataArray[i]);
            this.analyseSample(sampleValue);
            this.emitCurrentAudioLevel();
        }
    };
    /**
     * Normalizes the amplitude of Uint8Array audio samples into the range of 0 - 1
     * Samples are originally in the range of 0-256, where the midpoint of 128 is
     * silent and the values in either direction are progressively loud, into an
     * equivalent value between 0 and 1, where 0 is silent and 1 is maximally loud.
     * @param sample The unsigned integer sample
     * @returns The amplitude of the audio sample, in the range of 0 - 1
     */
    AudioLevelDetector.prototype.normalizeSample = function (sample) {
        return Math.abs(sample / 128 - 1);
    };
    AudioLevelDetector.prototype.analyseSample = function (normalizedSample) {
        var now = Date.now();
        var elapsedTime = now - this.start;
        if (normalizedSample < this.silenceAmplitudeThreshold) {
            if (elapsedTime > this.timeThreshold) {
                // Not speaking
                if (this.currentAudioLevel !== types_1.AudioLevel.SILENT) {
                    this.currentAudioLevel = types_1.AudioLevel.SILENT;
                }
            }
        }
        else if (normalizedSample >= this.highAmplitudeThreshold) {
            // Speaking loudly
            this.start = now;
            this.currentAudioLevel = types_1.AudioLevel.HIGH;
        }
        else {
            // Speaking softly
            this.start = now;
            this.currentAudioLevel = types_1.AudioLevel.LOW;
        }
    };
    AudioLevelDetector.prototype.emitCurrentAudioLevel = function () {
        var now = Date.now();
        if (this.previousAudioLevel !== this.currentAudioLevel) {
            // Allow emitting "high" sooner
            if (now - this.lastEmitTime > this.maxEmitInterval || this.currentAudioLevel === types_1.AudioLevel.HIGH) {
                this.emit("audioLevelChange", this.currentAudioLevel);
                this.lastEmitTime = now;
                this.previousAudioLevel = this.currentAudioLevel;
            }
        }
    };
    return AudioLevelDetector;
}(events_1.EventEmitter));
exports.default = AudioLevelDetector;
//# sourceMappingURL=audioLevelDetector.js.map