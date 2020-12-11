require("webrtc-adapter");
import {
  AudioLevelChangeHandler,
  EndpointRemovedEvent,
  IceCandidateEvent,
  MediaType,
  MessageReceivedEvent,
  RtcAuthParams,
  RtcOptions,
  RtcStream,
  SdpRequest,
  SdpOfferRejectedError,
} from "./types";
import Signaling from "./signaling";
import AudioLevelDetector from "./audioLevelDetector";
import DtmfSender from "./dtmfSender";

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [],
};

class BandwidthRtc {
  // Signaling
  private signaling: Signaling = new Signaling();

  // WebRTC
  private localPeerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStreams: Map<string, MediaStream> = new Map();

  private remotePeerConnections: Map<string, RTCPeerConnection> = new Map();
  private iceCandidateQueues: Map<string, RTCIceCandidate[]> = new Map();

  // DTMF
  private localDtmfSenders: Map<string, DtmfSender> = new Map();

  // Event handlers
  private streamAvailableHandler?: { (event: RtcStream): void };
  private streamUnavailableHandler?: { (endpointId: string): void };

  constructor() {
    this.setMicEnabled = this.setMicEnabled.bind(this);
    this.setCameraEnabled = this.setCameraEnabled.bind(this);
  }

  async connect(authParams: RtcAuthParams, options?: RtcOptions) {
    this.createSignalingBroker();

    this.signaling.addListener("sdpNeeded", this.handleSdpNeededEvent.bind(this));
    this.signaling.addListener("addIceCandidate", this.handleIceCandidateEvent.bind(this));
    this.signaling.addListener("endpointRemoved", this.handleEndpointRemovedEvent.bind(this));

    return this.signaling.connect(authParams, options);
  }

  onStreamAvailable(callback: { (event: RtcStream): void }): void {
    this.streamAvailableHandler = callback;
  }

  onStreamUnavailable(callback: { (endpointId: string): void }): void {
    this.streamUnavailableHandler = callback;
  }

  async publish(mediaStream: MediaStream, audioLevelChangeHandler?: AudioLevelChangeHandler, alias?: string): Promise<RtcStream>;
  async publish(constraints?: MediaStreamConstraints, audioLevelChangeHandler?: AudioLevelChangeHandler, alias?: string): Promise<RtcStream>;
  async publish(
    input: MediaStreamConstraints | MediaStream | undefined,
    audioLevelChangeHandler?: AudioLevelChangeHandler,
    alias?: string
  ): Promise<RtcStream> {
    let mediaStream: MediaStream;
    let constraints: MediaStreamConstraints = { audio: true, video: true };
    if (input instanceof MediaStream) {
      mediaStream = input;
    } else {
      if (typeof input === "object") {
        constraints = input as MediaStreamConstraints;
      }
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    let mediaTypes: MediaType[] = [];
    if (mediaStream.getAudioTracks().length > 0) {
      mediaTypes.push(MediaType.AUDIO);
    }
    if (mediaStream.getVideoTracks().length > 0) {
      mediaTypes.push(MediaType.VIDEO);
    }

    const sdpRequest = await this.signaling.requestToPublish(mediaTypes, alias);
    const endpointId = sdpRequest.endpointId;

    if (audioLevelChangeHandler) {
      const audioLevelDetector = new AudioLevelDetector({
        mediaStream: mediaStream,
      });
      audioLevelDetector.on("audioLevelChange", audioLevelChangeHandler);
    }

    const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
    this.setupNewPeerConnection(peerConnection, endpointId, mediaTypes, alias);
    mediaStream.getTracks().forEach((track) => {
      var sender = peerConnection.addTrack(track, mediaStream);

      // Inject DTMF into one audio track in the stream
      if (track.kind === "audio" && !this.localDtmfSenders.has(endpointId)) {
        this.localDtmfSenders.set(endpointId, new DtmfSender(sender));
      }
    });

    this.localPeerConnections.set(endpointId, peerConnection);
    this.localStreams.set(endpointId, mediaStream);

    await this.negotiateSdp(sdpRequest, peerConnection);

    return {
      endpointId: endpointId,
      mediaStream: mediaStream,
      mediaTypes: mediaTypes,
      alias: alias,
    };
  }

  async unpublish(...streams: string[]) {
    if (streams.length === 0) {
      streams = Array.from(this.localStreams.keys());
    }
    for (const s of streams) {
      this.signaling.unpublish(s);
      this.cleanupLocalStreams(s);
    }
  }

  /**
   * Returns an array of available video input devices
   */
  getVideoInputs(): Promise<MediaDeviceInfo[]> {
    return this.getMediaDevices("videoinput");
  }

  /**
   * Returns an array of available audio input devices
   */
  getAudioInputs(): Promise<MediaDeviceInfo[]> {
    return this.getMediaDevices("audioinput");
  }

  /**
   * Returns an array of available audio output devices
   */
  getAudioOutputs(): Promise<MediaDeviceInfo[]> {
    return this.getMediaDevices("audiooutput");
  }

  /**
   * Returns an array of available media devices, optionally filtered by device kind
   * @param filter Device kind to filter on
   */
  async getMediaDevices(filter?: string): Promise<MediaDeviceInfo[]> {
    let devices = await navigator.mediaDevices.enumerateDevices();

    if (filter) {
      devices = devices.filter((device) => device.kind === filter);
    }

    return devices;
  }

  sendDtmf(tone: string, streamId?: string) {
    if (streamId) {
      this.localDtmfSenders.get(streamId)?.sendDtmf(tone);
    } else {
      this.localDtmfSenders.forEach((dtmfSender) => dtmfSender.sendDtmf(tone));
    }
  }

  setMicEnabled(enabled: boolean, streamId?: string) {
    if (streamId) {
      this.localStreams
        .get(streamId)
        ?.getAudioTracks()
        .forEach((track) => (track.enabled = enabled));
    } else {
      this.localStreams.forEach((stream) => stream.getAudioTracks().forEach((track) => (track.enabled = enabled)));
    }
  }

  setCameraEnabled(enabled: boolean, streamId?: string) {
    if (streamId) {
      this.localStreams
        .get(streamId)
        ?.getVideoTracks()
        .forEach((track) => (track.enabled = enabled));
    } else {
      this.localStreams.forEach((stream) => stream.getVideoTracks().forEach((track) => (track.enabled = enabled)));
    }
  }

  disconnect() {
    this.signaling.disconnect();
    this.stopLocalMedia();
    this.localStreams = new Map();
  }

  private createSignalingBroker() {
    this.signaling = new Signaling();
  }

  private handleIceCandidateEvent(event: IceCandidateEvent) {
    const endpointId = event.endpointId;
    const candidate = event.candidate;
    const rtcPeerConnection = this.remotePeerConnections.get(endpointId) || this.localPeerConnections.get(endpointId);

    if (rtcPeerConnection && rtcPeerConnection.currentRemoteDescription) {
      // If we have already created a peer connection and set its remote description, just add the candidate
      rtcPeerConnection.addIceCandidate(candidate);
    } else {
      // Otherwise, we will need to put the candidate on a queue until the remote description is set
      let remoteIceCandidates = this.iceCandidateQueues.get(endpointId);
      if (remoteIceCandidates) {
        remoteIceCandidates.push(candidate);
      } else {
        this.iceCandidateQueues.set(endpointId, [candidate]);
      }
    }
  }

  private handleEndpointRemovedEvent(event: EndpointRemovedEvent) {
    if (this.streamUnavailableHandler) {
      this.streamUnavailableHandler(event.endpointId);
    }
  }

  private stopLocalMedia(streamId?: string) {
    if (streamId) {
      // If a stream ID was passed in, just stop that particular one
      this.localStreams
        .get(streamId)
        ?.getTracks()
        .forEach((track) => track.stop());
    } else {
      // Otherwise stop all tracks from all streams
      this.localStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
    }
  }

  private async handleSdpNeededEvent(sdpRequest: SdpRequest) {
    const endpointId = sdpRequest.endpointId;
    const alias = sdpRequest.alias;
    const participantId = sdpRequest.participantId;
    let peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
    this.setupNewPeerConnection(peerConnection, endpointId, sdpRequest.mediaTypes, alias, participantId);

    this.remotePeerConnections.set(endpointId, peerConnection);

    return this.negotiateSdp(sdpRequest, peerConnection as RTCPeerConnection);
  }

  private async negotiateSdp(sdpRequest: SdpRequest, peerConnection: RTCPeerConnection): Promise<void> {
    const endpointId = sdpRequest.endpointId;
    const direction = sdpRequest.direction;

    let offerOptions = {
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    };
    if (direction.includes("recv")) {
      offerOptions.offerToReceiveAudio = sdpRequest.mediaTypes.includes(MediaType.AUDIO);
      offerOptions.offerToReceiveVideo = sdpRequest.mediaTypes.includes(MediaType.VIDEO);
    }

    const offer = await peerConnection.createOffer(offerOptions);
    if (!offer.sdp) {
      throw new Error("Created offer with no SDP");
    }

    try {
      const sdpResponse = await this.signaling.offerSdp(offer.sdp, endpointId);

      await peerConnection.setLocalDescription(offer);
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: sdpResponse.sdpAnswer,
      });

      if (sdpResponse.candidates) {
        sdpResponse.candidates.forEach((candidate) => {
          peerConnection.addIceCandidate(candidate);
        });
      }

      let queuedIceCandidates = this.iceCandidateQueues.get(endpointId);
      if (queuedIceCandidates) {
        queuedIceCandidates.forEach((candidate) => {
          peerConnection.addIceCandidate(candidate);
        });
        this.iceCandidateQueues.delete(endpointId);
      }
    } catch (e) {
      if (String(e.message).toLowerCase().includes("sdp")) {
        throw new SdpOfferRejectedError(e.message);
      } else {
        throw e;
      }
    }
  }

  private setupNewPeerConnection(peerConnection: RTCPeerConnection, endpointId: string, mediaTypes: MediaType[], alias?: string, participantId?: string): void {
    peerConnection.onconnectionstatechange = (event: Event) => {
      const peerConnection = event.target as RTCPeerConnection;
      const connectionState = peerConnection.connectionState;
      if (connectionState === "disconnected" || connectionState === "failed") {
        // TODO: if the peer that is disconnected/failed was a publish, we should try and re-publish it
        if (this.streamUnavailableHandler) {
          this.streamUnavailableHandler(endpointId);
        }
        this.cleanupRemoteStreams(endpointId);
      }
    };

    peerConnection.oniceconnectionstatechange = (event) => {};

    peerConnection.onicegatheringstatechange = (event) => {};

    peerConnection.onnegotiationneeded = (event) => {};

    peerConnection.onsignalingstatechange = (event) => {};

    peerConnection.onicecandidate = (event) => this.signaling.sendIceCandidate(endpointId, event.candidate);

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      const streams: readonly MediaStream[] = event.streams;
      const track: MediaStreamTrack = event.track;
      const transceiver: RTCRtpTransceiver = event.transceiver;
      const receiver: RTCRtpReceiver = event.receiver;

      if (this.streamAvailableHandler) {
        this.streamAvailableHandler({
          endpointId: endpointId,
          mediaStream: event.streams[0],
          mediaTypes: mediaTypes,
          alias: alias,
          participantId: participantId,
        });
      }

      track.onmute = (event) => {};

      track.onunmute = (event) => {};

      track.onended = (event) => {};
    };
  }

  private cleanupLocalStreams(...streams: string[]) {
    if (streams.length === 0) {
      streams = Array.from(this.localStreams.keys());
    }

    for (const s of streams) {
      this.stopLocalMedia(s);
      this.localStreams.delete(s);

      const localPeerConnection = this.localPeerConnections.get(s);
      localPeerConnection?.close();
      this.localPeerConnections.delete(s);

      const dtmfSender = this.localDtmfSenders.get(s);
      dtmfSender?.disconnect();
      this.localDtmfSenders.delete(s);
    }
  }

  private cleanupRemoteStreams(...streams: string[]) {
    if (streams.length === 0) {
      streams = Array.from(this.remotePeerConnections.keys());
    }

    for (const s of streams) {
      const remotePeerConnection = this.remotePeerConnections.get(s);
      remotePeerConnection?.close();
      this.remotePeerConnections.delete(s);
    }
  }
}

export default BandwidthRtc;
