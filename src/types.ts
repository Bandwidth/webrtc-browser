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
}

export type AudioLevelChangeHandler = { (audioLevel: AudioLevel): void };

export interface RtcAuthParams {
  deviceToken: string;
}

export interface RtcOptions {
  websocketUrl?: string;
}

export interface SdpRequest {
  endpointId: string;
  mediaTypes: MediaType[];
  direction: RTCRtpTransceiverDirection;
  alias: string;
  participantId?: string;
}

export interface SdpResponse {
  sdpAnswer: string;
  candidates?: RTCIceCandidate[];
}

export interface RtcStream {
  endpointId: string;
  mediaTypes: MediaType[];
  mediaStream: MediaStream;
  alias?: string;
  participantId?: string;
}

export interface EndpointRemovedEvent {
  endpointId: string;
}

export interface IceCandidateEvent {
  endpointId: string;
  candidate: RTCIceCandidate;
}

export interface MessageReceivedEvent {
  channelId: string;
  message: string;
}

export class SdpOfferRejectedError extends Error {}
