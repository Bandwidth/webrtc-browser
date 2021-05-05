import { MediaType } from "../types";

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
