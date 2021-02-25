require("webrtc-adapter");
import * as sdpTransform from "sdp-transform";

import { AudioLevelChangeHandler, RtcAuthParams, RtcOptions, RtcStream } from "../types";
import { SubscribeSdpOffer, SubscribedStreamMetadata, PublishSdpAnswer, PublishedStream, PublishMetadata } from "./types";
import Signaling from "./signaling";
import AudioLevelDetector from "../audioLevelDetector";
import DtmfSender from "../dtmfSender";
import logger, { LogLevel } from "../logging";

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  // sdpSemantics: "unified",
};

class BandwidthRtc {
  // Signaling
  private signaling: Signaling = new Signaling();

  // WebRTC
  private publishingPeerConnection?: RTCPeerConnection;
  private subscribingPeerConnection?: RTCPeerConnection;

  // Keyed by mediastream id (msid)
  private publishedStreams: Map<string, PublishedStream> = new Map();
  private subscribedStreams: Map<string, SubscribedStreamMetadata> = new Map();

  // TODO: can I kill this? Hopefully if we set streamId as endpointId
  private endpointIdsToStreams: Map<string, PublishedStream> = new Map();

  private subscribingPeerConnectionSdpRevision = 0;

  // DTMF
  private localDtmfSenders: Map<string, DtmfSender> = new Map();

  // Event handlers
  private streamAvailableHandler?: { (event: RtcStream): void };
  private streamUnavailableHandler?: { (endpointId: string): void };

  constructor(logLevel?: LogLevel) {
    if (logLevel) {
      console.log("setting log level to", logLevel);
      logger.level = logLevel;
    }
    // TODO: which of these actually need to be bound?
    this.setMicEnabled = this.setMicEnabled.bind(this);
    this.setCameraEnabled = this.setCameraEnabled.bind(this);
    this.handleSubscribeSdpOffer = this.handleSubscribeSdpOffer.bind(this);
    this.setupPublishingPeerConnection = this.setupPublishingPeerConnection.bind(this);
    this.setupSubscribingPeerConnection = this.setupSubscribingPeerConnection.bind(this);
    this.setupNewPeerConnection = this.setupNewPeerConnection.bind(this);
    this.cleanupPublishedStreams = this.cleanupPublishedStreams.bind(this);
    this.publish = this.publish.bind(this);
  }

  async connect(authParams: RtcAuthParams, options?: RtcOptions) {
    logger.info("Connecting to Bandwidth WebRTC");
    this.signaling.addListener("sdpOffer", this.handleSubscribeSdpOffer.bind(this));

    await this.signaling.connect(authParams, options);
    logger.info("Successfully connected");
  }

  setLogLevel(logLevel: LogLevel) {
    logger.level = logLevel;
  }

  onStreamAvailable(callback: { (event: RtcStream): void }): void {
    this.streamAvailableHandler = callback;
  }

  onStreamUnavailable(callback: { (endpointId: string): void }): void {
    this.streamUnavailableHandler = callback;
  }

  async publish(input?: MediaStreamConstraints | MediaStream, audioLevelChangeHandler?: AudioLevelChangeHandler, alias?: string): Promise<RtcStream> {
    let mediaStream: MediaStream;
    if (input instanceof MediaStream) {
      mediaStream = input;
    } else {
      let constraints: MediaStreamConstraints = { audio: true, video: true };
      if (typeof input === "object") {
        constraints = input as MediaStreamConstraints;
      }
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    logger.info(`Publishing mediaStream ${mediaStream.id} (${alias})`);
    if (!this.publishingPeerConnection) {
      await this.setupPublishingPeerConnection();
    }
    this.addStreamToPublishingPeerConnection(mediaStream);

    if (audioLevelChangeHandler) {
      const audioLevelDetector = new AudioLevelDetector({
        mediaStream: mediaStream,
      });
      audioLevelDetector.on("audioLevelChange", audioLevelChangeHandler);
    }

    const remoteSdpAnswer = await this.offerPublishSdp();
    const remoteStreamMetadata = remoteSdpAnswer.streamMetadata[mediaStream.id];

    this.publishedStreams.set(mediaStream.id, {
      mediaStream: mediaStream,
      metadata: remoteStreamMetadata,
    });
    this.endpointIdsToStreams.set(remoteStreamMetadata.endpointId, {
      mediaStream: mediaStream,
      metadata: remoteStreamMetadata,
    });

    return {
      endpointId: remoteStreamMetadata.endpointId,
      mediaStream: mediaStream,
      mediaTypes: remoteStreamMetadata.mediaTypes,
      alias: alias,
    };
  }

  async unpublish(...streams: string[]) {
    logger.info(`Unpublishing media streams ${streams}`);
    this.cleanupPublishedStreams(...streams);
    this.offerPublishSdp();
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
    logger.info(`Setting microphone enabled: ${enabled}`);
    [...this.publishedStreams]
      .filter(([msid]) => !streamId || streamId === msid)
      .forEach(([, stream]) => stream.mediaStream.getAudioTracks().forEach((track) => (track.enabled = enabled)));
  }

  setCameraEnabled(enabled: boolean, streamId?: string) {
    logger.info(`Setting camera enabled: ${enabled}`);
    [...this.publishedStreams]
      .filter(([msid]) => !streamId || streamId === msid)
      .forEach(([, stream]) => stream.mediaStream.getVideoTracks().forEach((track) => (track.enabled = enabled)));
    // if (streamId) {
    //   this.outboundStreams
    //     .get(streamId)
    //     ?.mediaStream.getVideoTracks()
    //     .forEach((track) => (track.enabled = enabled));
    // } else {
    //   this.inboundStreams.forEach((stream) => stream.getVideoTracks().forEach((track) => (track.enabled = enabled)));
    // }
  }

  disconnect() {
    logger.info("Disconnecting");
    this.signaling.disconnect();
    this.cleanupPublishedStreams();
  }

  private async offerPublishSdp(): Promise<PublishSdpAnswer> {
    const localSdpOffer = await this.publishingPeerConnection!.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false,
      voiceActivityDetection: true,
      iceRestart: false,
    });

    const publishMetadata = [...this.publishedStreams].reduce((publishMetadata: PublishMetadata, [streamId, stream]) => {
      publishMetadata[streamId] = stream.metadata;
      return publishMetadata;
    }, {});
    const remoteSdpAnswer = await this.signaling.offerSdp(localSdpOffer.sdp!, publishMetadata);

    await this.publishingPeerConnection!.setLocalDescription(localSdpOffer);
    await this.publishingPeerConnection!.setRemoteDescription({
      type: "answer",
      sdp: remoteSdpAnswer.sdpAnswer,
    });

    return remoteSdpAnswer;
  }

  private async handleSubscribeSdpOffer(subscribeSdpOffer: SubscribeSdpOffer) {
    logger.info("Received SDP offer", subscribeSdpOffer);
    if (subscribeSdpOffer.sdpRevision <= this.subscribingPeerConnectionSdpRevision) {
      logger.debug(
        `Revision on SDP offer (${subscribeSdpOffer.sdpRevision}) is less than current revision (${this.subscribingPeerConnectionSdpRevision}), ignoring`
      );
      return;
    } else {
      this.subscribingPeerConnectionSdpRevision = subscribeSdpOffer.sdpRevision;
    }
    const remoteSdpOffer = subscribeSdpOffer.sdpOffer;

    this.subscribedStreams.clear();
    Object.entries(subscribeSdpOffer.streamMetadata).forEach(([streamId, metadata]) => {
      this.subscribedStreams.set(streamId, metadata);
    });
    // this.inboundStreams = new Map(Object.entries(inboundSdpOffer.streamMetadata));

    if (!this.subscribingPeerConnection) {
      await this.setupSubscribingPeerConnection();
    }

    await this.subscribingPeerConnection!.setRemoteDescription({
      type: "offer",
      sdp: remoteSdpOffer,
    });

    let localSdpAnswer = await this.subscribingPeerConnection!.createAnswer();
    if (!localSdpAnswer.sdp) {
      throw new Error(`RTCPeerConnection.createAnswer returned ${localSdpAnswer}`);
    }

    // Munge the SDP to change the setup from "actpass" to "passive"
    // This unfortunately seems to be required
    let parsedSdpAnswer = sdpTransform.parse(localSdpAnswer.sdp!);
    parsedSdpAnswer.media.forEach((media) => (media.setup = "passive"));
    localSdpAnswer.sdp = sdpTransform.write(parsedSdpAnswer);

    // TODO: see if this actually needs to be awaited
    await this.signaling.answerSdp(localSdpAnswer.sdp);

    await this.subscribingPeerConnection!.setLocalDescription(localSdpAnswer);
  }

  private async setupPublishingPeerConnection(): Promise<RTCPeerConnection> {
    this.publishingPeerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

    this.setupNewPeerConnection(this.publishingPeerConnection, this.setupPublishingPeerConnection);

    // (Re)publish any existing media streams
    if (this.publishedStreams.size > 0) {
      this.publishedStreams.forEach((publishedStream) => {
        this.addStreamToPublishingPeerConnection(publishedStream.mediaStream);
      });
      await this.offerPublishSdp();
    }

    return this.publishingPeerConnection;
  }

  private async setupSubscribingPeerConnection(): Promise<RTCPeerConnection> {
    this.subscribingPeerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

    this.setupNewPeerConnection(this.subscribingPeerConnection, this.setupSubscribingPeerConnection);

    this.subscribingPeerConnection.ontrack = (event: RTCTrackEvent) => {
      logger.debug("ontrack", event);
      const streams: readonly MediaStream[] = event.streams;
      const track: MediaStreamTrack = event.track;
      const transceiver: RTCRtpTransceiver = event.transceiver;
      const receiver: RTCRtpReceiver = event.receiver;

      const streamMetadata = streams.map((stream) => this.subscribedStreams.get(stream.id))[0];

      if (this.streamAvailableHandler) {
        for (let stream of streams) {
          logger.debug("streamAvailable", stream.id);
          let remoteStreamMetadata = this.subscribedStreams.get(stream.id)!;
          logger.debug("remoteStreamMetadata", remoteStreamMetadata);
          this.streamAvailableHandler({
            ...remoteStreamMetadata,
            mediaStream: stream,
          });
        }
      }

      track.onmute = (event) => {
        logger.debug("onmute", event);
      };

      track.onunmute = (event) => {
        logger.debug("onunmute", event);
      };

      track.onended = (event) => {
        logger.debug("onended", event);
        if (this.streamUnavailableHandler) {
          for (let stream of streams) {
            logger.debug("streamId", stream.id);
            // TODO: if we're cheating and endpointId === streamId, we can skip this lookup
            logger.debug("remoteStreamMetadata", streamMetadata);
            if (streamMetadata) {
              logger.debug("calling streamUnavailableHandler", streamMetadata.endpointId);
              this.streamUnavailableHandler(streamMetadata.endpointId);
            }
          }
        }
      };
    };

    return this.subscribingPeerConnection;
  }

  private setupNewPeerConnection(peerConnection: RTCPeerConnection, onPeerClosed: CallableFunction): void {
    logger.debug("setupNewPeerConnection this.remoteStreams", this.publishedStreams);
    peerConnection.onconnectionstatechange = (event: Event) => {
      const pc = event.target as RTCPeerConnection;
      const connectionState = pc.connectionState;
      if (connectionState === "disconnected" || connectionState === "failed" || connectionState === "closed") {
        onPeerClosed();
      }
    };

    peerConnection.onconnectionstatechange = (event: Event) => {
      logger.debug("onconnectionstatechange", event.target);
    };

    peerConnection.oniceconnectionstatechange = (event) => {
      logger.debug("oniceconnectionstatechange", event.target);
    };

    peerConnection.onicegatheringstatechange = (event) => {
      logger.debug("onicegatheringstatechange", event.target);
    };

    peerConnection.onnegotiationneeded = (event) => {
      logger.debug("onnegotiationneeded", event.target);
    };

    peerConnection.onsignalingstatechange = (event) => {
      logger.debug("onsignalingstatechange", event.target);
    };

    peerConnection.onicecandidate = (event) => {
      logger.debug("onicecandidate", event.target);
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      logger.debug("ontrack", event);
      logger.debug("this.remoteStreams", this.subscribedStreams);
      const streams: readonly MediaStream[] = event.streams;
      const track: MediaStreamTrack = event.track;
      const transceiver: RTCRtpTransceiver = event.transceiver;
      const receiver: RTCRtpReceiver = event.receiver;

      track.onmute = (event) => {
        logger.debug("onmute", event);
      };

      track.onunmute = (event) => {
        logger.debug("onunmute", event);
      };

      track.onended = (event) => {
        logger.debug("onended", event);
      };
    };
  }

  private addStreamToPublishingPeerConnection(mediaStream: MediaStream) {
    mediaStream.getTracks().forEach((track) => {
      this.publishingPeerConnection!.addTransceiver(track, {
        direction: "sendonly",
        streams: [mediaStream],
      });

      // // Inject DTMF into one audio track in the stream
      // if (track.kind === "audio" && !this.localDtmfSenders.has(endpointId)) {
      //   this.localDtmfSenders.set(endpointId, new DtmfSender(sender));
      // }
    });
  }

  private cleanupPublishedStreams(...endpointIds: string[]) {
    logger.debug(`cleanupPublishedStreams: ${endpointIds}`);
    if (endpointIds.length === 0) {
      endpointIds = Array.from(this.endpointIdsToStreams.keys());
    }

    logger.debug(`streams: ${endpointIds}`);
    for (const endpointId of endpointIds) {
      logger.debug(`streamId: ${endpointId}`);
      const publishedStream = this.endpointIdsToStreams.get(endpointId);
      logger.debug(`publishedStream: ${publishedStream}`);
      if (publishedStream) {
        logger.debug(`tracks: ${publishedStream?.mediaStream.getTracks()}`);
        publishedStream.mediaStream.getTracks().forEach((track) => {
          this.publishingPeerConnection!.getTransceivers()
            .filter((t) => t.sender.track === track)
            .forEach((t) => {
              t.sender.replaceTrack(null);
              this.publishingPeerConnection!.removeTrack(t.sender);
              t.stop();
            });
          track.stop();
        });
        this.publishedStreams.delete(publishedStream.mediaStream.id);
        this.endpointIdsToStreams.delete(endpointId);
      }
      // this.endpointIdsToStreams
      //   .get(s)
      //   ?.mediaStream.getTracks()
      //   .forEach((t) => t.stop());
      // TODO: consider calling removeTrack on the peer connection first, then negotiating, THEN stopping tracks
      // this MAY result in better behavior?
      // let stream = this.localStreams.get(s)!;
      // stream.getTracks().forEach(t => t.stop());
    }
  }
}

export default BandwidthRtc;
