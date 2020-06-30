import { AudioLevelChangeHandler, RtcAuthParams, RtcOptions, RtcStream } from "./types";
declare class BandwidthRtc {
    private signaling;
    private localPeerConnections;
    private localStreams;
    private remotePeerConnections;
    private iceCandidateQueues;
    private dtmfSender;
    private streamAvailableHandler?;
    private streamUnavailableHandler?;
    constructor();
    sendDtmf(tones: string): void;
    connect(authParams: RtcAuthParams, options?: RtcOptions): Promise<unknown>;
    onStreamAvailable(callback: {
        (event: RtcStream): void;
    }): void;
    onStreamUnavailable(callback: {
        (endpointId: string): void;
    }): void;
    publish(mediaStream: MediaStream, audioLevelChangeHandler?: AudioLevelChangeHandler): Promise<RtcStream>;
    publish(constraints?: MediaStreamConstraints, audioLevelChangeHandler?: AudioLevelChangeHandler): Promise<RtcStream>;
    unpublish(...streams: string[]): Promise<void>;
    setMicEnabled(enabled: boolean, streamId?: string): void;
    setCameraEnabled(enabled: boolean, streamId?: string): void;
    disconnect(): void;
    private createSignalingBroker;
    private handleIceCandidateEvent;
    private handleEndpointRemovedEvent;
    private stopLocalMedia;
    private handleSdpNeededEvent;
    private negotiateSdp;
    private setupNewPeerConnection;
    private cleanupLocalStreams;
    private cleanupRemoteStreams;
}
export default BandwidthRtc;
