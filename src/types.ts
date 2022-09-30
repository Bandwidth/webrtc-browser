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

/**
 * @property {string} deviceToken - The device token is a "string" in the JWT format.
 * To be possible the token utilization, parse the token using "jwt_decode" function, the expected result should be a {@link JwtPayload} object.
 */
export interface RtcAuthParams {
  deviceToken: string;
}

export interface RtcOptions {
  websocketUrl?: string;
  envOptions?: EnvironmentOptions;
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export interface EnvironmentOptions {
  environment?: string;
  geoRegion?: string;
  subdomain?: string;
}

export interface RtcStream {
  endpointId: string;
  mediaTypes: MediaType[];
  mediaStream: MediaStream;
  alias?: string;
  participantId?: string;
}

export class BandwidthRtcError extends Error {}
