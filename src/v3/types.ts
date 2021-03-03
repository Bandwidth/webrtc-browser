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
  participantId?: string;
}

export interface PublishedStream {
  mediaStream: MediaStream;
  metadata: StreamMetadata;
}

export interface PublishMetadata {
  [streamId: string]: StreamMetadata;
}
