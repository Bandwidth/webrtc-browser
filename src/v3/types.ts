import { MediaType } from "../types";

export interface SubscribeSdpOffer {
  sdpOffer: string;
  sdpRevision: number;
  endpointId: string;
  streamMetadata: {
    [streamId: string]: StreamMetadata;
  };
}

export interface PublishSdpAnswer {
  sdpAnswer: string;
  endpointId: string;
  streamMetadata: {
    [streamId: string]: StreamMetadata;
  };
}

export interface StreamMetadata {
  endpointId: string;
  mediaTypes: MediaType[];
  alias?: string;
  participantId: string;
}

export interface StreamPublishMetadata {
  alias?: string;
}

export interface DataChannelPublishMetadata {
  label: string;
  streamId: number;
}

export interface PublishedStream {
  mediaStream: MediaStream;
  metadata?: StreamPublishMetadata;
}

export interface PublishMetadata {
  mediaStreams: {
    [streamId: string]: StreamPublishMetadata;
  };
  dataChannels: {
    [dataChannelLabel: string]: DataChannelPublishMetadata;
  };
}

export interface CodecPreferences {
  audio?: RTCRtpCodecCapability[];
  video?: RTCRtpCodecCapability[];
}
