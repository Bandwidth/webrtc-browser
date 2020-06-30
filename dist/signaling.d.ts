/// <reference types="node" />
import { EventEmitter } from "events";
import { RtcAuthParams, RtcOptions, MediaType, SdpRequest, SdpResponse } from "./types";
declare class Signaling extends EventEmitter {
    private defaultWebsocketUrl;
    private ws;
    private pingInterval?;
    Signaling(): void;
    connect(authParams: RtcAuthParams, options?: RtcOptions): Promise<unknown>;
    disconnect(): void;
    requestToPublish(mediaTypes: MediaType[]): Promise<SdpRequest>;
    offerSdp(sdpOffer: string, endpointId: string): Promise<SdpResponse>;
    sendIceCandidate(endpointId: string, candidate: RTCIceCandidate | null): void;
    private setMediaPreferences;
}
export default Signaling;
