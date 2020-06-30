/// <reference types="node" />
import { EventEmitter } from "events";
export interface AudioLevelDetectorOptions {
    mediaStream: MediaStream;
    timeThreshold?: number;
    silenceAmplitudeThreshold?: number;
    highAmplitudeThreshold?: number;
    sampleInterval?: number;
    maxEmitInterval?: number;
}
export default class AudioLevelDetector extends EventEmitter {
    private start;
    private lastEmitTime;
    private timeThreshold;
    private silenceAmplitudeThreshold;
    private highAmplitudeThreshold;
    private sampleInterval;
    private maxEmitInterval;
    private analyserNode;
    private currentAudioLevel;
    private previousAudioLevel;
    constructor(config: AudioLevelDetectorOptions);
    analyse(): void;
    /**
     * Normalizes the amplitude of Uint8Array audio samples into the range of 0 - 1
     * Samples are originally in the range of 0-256, where the midpoint of 128 is
     * silent and the values in either direction are progressively loud, into an
     * equivalent value between 0 and 1, where 0 is silent and 1 is maximally loud.
     * @param sample The unsigned integer sample
     * @returns The amplitude of the audio sample, in the range of 0 - 1
     */
    normalizeSample(sample: number): number;
    analyseSample(normalizedSample: number): void;
    emitCurrentAudioLevel(): void;
}
