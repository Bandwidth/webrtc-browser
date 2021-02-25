import { MediaType } from "../types";

export interface SubscribeSdpOffer {
  sdpOffer: string;
  sdpRevision: number;
  endpointId: string;
  streamMetadata: {
    [streamId: string]: SubscribedStreamMetadata;
  };
}

export interface PublishSdpAnswer {
  sdpAnswer: string;
  endpointId: string;
  streamMetadata: {
    [streamId: string]: SubscribedStreamMetadata;
  };
}

export interface SubscribedStreamMetadata {
  endpointId: string;
  mediaTypes: MediaType[];
  alias: string;
  participantId: string;
}

export interface PublishedStream {
  mediaStream: MediaStream;
  metadata: PublishedStreamMetadata;
}

export interface PublishMetadata {
  [streamId: string]: PublishedStreamMetadata;
}

export interface PublishedStreamMetadata {
  alias?: string;
}
