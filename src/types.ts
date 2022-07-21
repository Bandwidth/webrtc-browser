export enum AudioLevel {
  SILENT = "silent",
  LOW = "low",
  HIGH = "high",
}

export enum MediaAggregationType {
  NONE = "NONE",
  COMPOSITE = "COMPOSITE",
}

export enum MediaType {
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  APPLICATION = "APPLICATION",
}

export type AudioLevelChangeHandler = { (audioLevel: AudioLevel): void };

export interface RtcAuthParams {
  deviceToken: string;
}

export interface RtcOptions {
  websocketUrl?: string;
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export interface RtcStream {
  endpointId: string;
  mediaTypes: MediaType[];
  mediaStream: MediaStream;
  alias?: string;
  participantId?: string;
}

export class BandwidthRtcError extends Error {}
