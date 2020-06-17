import { EventEmitter } from "events";
import { AudioLevel } from "./types";

export interface AudioLevelDetectorOptions {
  mediaStream: MediaStream;
  timeThreshold?: number;
  silenceAmplitudeThreshold?: number;
  highAmplitudeThreshold?: number;
  sampleInterval?: number;
  maxEmitInterval?: number;
}

export default class AudioLevelDetector extends EventEmitter {
  private start: number = 0;
  private lastEmitTime: number = 0;
  private timeThreshold = 500;
  private silenceAmplitudeThreshold = 0.2;
  private highAmplitudeThreshold = 0.5;
  private sampleInterval: number = 100; // ms
  private maxEmitInterval: number = 500; // ms;
  private analyserNode: AnalyserNode;
  private currentAudioLevel: AudioLevel = AudioLevel.SILENT;
  private previousAudioLevel: AudioLevel | undefined;

  constructor(config: AudioLevelDetectorOptions) {
    super();

    if (config.timeThreshold) {
      this.timeThreshold = config.timeThreshold;
    }
    if (config.silenceAmplitudeThreshold) {
      this.silenceAmplitudeThreshold = config.silenceAmplitudeThreshold;
    }
    if (config.highAmplitudeThreshold) {
      this.highAmplitudeThreshold = config.highAmplitudeThreshold;
    }
    if (config.sampleInterval) {
      this.sampleInterval = config.sampleInterval;
    }
    if (config.maxEmitInterval) {
      this.maxEmitInterval = config.maxEmitInterval;
    }

    // Assigning the media stream as the srcObject of an Audio element
    // is required by Chrome in some circumstances to actually start
    // the audio flowing through the Web Audio API nodes
    new Audio().srcObject = config.mediaStream;

    const context = new AudioContext();
    const source = context.createMediaStreamSource(config.mediaStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    this.analyserNode = analyser;

    setInterval(this.analyse.bind(this), this.sampleInterval);
  }

  analyse() {
    const bufferLength = this.analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteTimeDomainData(dataArray);
    // Iterate over each of the samples
    for (let i = 0; i < bufferLength; i++) {
      const sampleValue = this.normalizeSample(dataArray[i]);
      this.analyseSample(sampleValue);
      this.emitCurrentAudioLevel();
    }
  }

  /**
   * Normalizes the amplitude of Uint8Array audio samples into the range of 0 - 1
   * Samples are originally in the range of 0-256, where the midpoint of 128 is
   * silent and the values in either direction are progressively loud, into an
   * equivalent value between 0 and 1, where 0 is silent and 1 is maximally loud.
   * @param sample The unsigned integer sample
   * @returns The amplitude of the audio sample, in the range of 0 - 1
   */
  normalizeSample(sample: number) {
    return Math.abs(sample / 128 - 1);
  }

  analyseSample(normalizedSample: number) {
    const now = Date.now();
    const elapsedTime = now - this.start;
    if (normalizedSample < this.silenceAmplitudeThreshold) {
      if (elapsedTime > this.timeThreshold) {
        // Not speaking
        if (this.currentAudioLevel !== AudioLevel.SILENT) {
          this.currentAudioLevel = AudioLevel.SILENT;
        }
      }
    } else if (normalizedSample >= this.highAmplitudeThreshold) {
      // Speaking loudly
      this.start = now;
      this.currentAudioLevel = AudioLevel.HIGH;
    } else {
      // Speaking softly
      this.start = now;
      this.currentAudioLevel = AudioLevel.LOW;
    }
  }

  emitCurrentAudioLevel() {
    const now = Date.now();
    if (this.previousAudioLevel !== this.currentAudioLevel) {
      // Allow emitting "high" sooner
      if (now - this.lastEmitTime > this.maxEmitInterval || this.currentAudioLevel === AudioLevel.HIGH) {
        this.emit("audioLevelChange", this.currentAudioLevel);
        this.lastEmitTime = now;
        this.previousAudioLevel = this.currentAudioLevel;
      }
    }
  }
}
