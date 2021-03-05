require("webrtc-adapter");
import { Mutex } from "async-mutex";
import * as sdpTransform from "sdp-transform";

import { AudioLevelChangeHandler, BandwidthRtcError, RtcAuthParams, RtcOptions, RtcStream } from "../types";
import { PublishMetadata, PublishSdpAnswer, PublishedStream, StreamMetadata, SubscribeSdpOffer } from "./types";
import Signaling from "./signaling";
import AudioLevelDetector from "../audioLevelDetector";
import DtmfSender from "../dtmfSender";
import logger, { LogLevel } from "../logging";

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

class BandwidthRtc {
  // Communicates with the Bandwidth WebRTC platform
  private signaling: Signaling = new Signaling();

  // One peer for all published (outgoing) streams, one for all subscribed (incoming) streams
  private publishingPeerConnection?: RTCPeerConnection;
  private subscribingPeerConnection?: RTCPeerConnection;

  // Prevents concurrent modification to RTCPeerConnection state (can cause race conditions)
  private publishMutex: Mutex = new Mutex();
  private subscribeMutex: Mutex = new Mutex();

  // Lookup maps for streams, keyed by mediastream id (msid)
  private publishedStreams: Map<string, PublishedStream> = new Map();
  private subscribedStreams: Map<string, StreamMetadata> = new Map();

  // Current SDP revision for the subscribing peer; used to reject outdated SDP offers
  private subscribingPeerConnectionSdpRevision = 0;

  // DTMF
  private localDtmfSenders: Map<string, DtmfSender> = new Map();

  // Event handlers
  private streamAvailableHandler?: { (event: RtcStream): void };
  private streamUnavailableHandler?: { (streamId: string): void };

  /**
   * Construct a new instance of BandwidthRtc
   * @param logLevel desired log level for logs that will appear in the browser's console, optional
   */
  constructor(logLevel?: LogLevel) {
    if (logLevel) {
      logger.level = logLevel;
    }

    this.setMicEnabled = this.setMicEnabled.bind(this);
    this.setCameraEnabled = this.setCameraEnabled.bind(this);

    this.setupPublishingPeerConnection = this.setupPublishingPeerConnection.bind(this);
    this.setupSubscribingPeerConnection = this.setupSubscribingPeerConnection.bind(this);
    this.setupNewPeerConnection = this.setupNewPeerConnection.bind(this);
  }

  /**
   * Connect to the Bandwidth WebRTC platform
   * @param authParams connection credentials
   * @param options additional connection options; usually unnecessary
   */
  async connect(authParams: RtcAuthParams, options?: RtcOptions) {
    logger.info("Connecting to Bandwidth WebRTC");
    this.signaling.on("sdpOffer", this.handleSubscribeSdpOffer.bind(this));

    await this.signaling.connect(authParams, options);
    logger.info("Successfully connected");
  }

  /**
   * Set the log level for logs that will appear in the browser's console
   * Defaults to "warn"
   * @param logLevel log level
   */
  setLogLevel(logLevel: LogLevel) {
    logger.level = logLevel;
  }

  /**
   * Set the function that will be called when a subscribed stream becomes available
   * @param callback callback function
   */
  onStreamAvailable(callback: { (event: RtcStream): void }): void {
    this.streamAvailableHandler = callback;
  }

  /**
   * Set the function that will be called when a subscribed stream becomes unavailable
   * @param callback callback function
   */
  onStreamUnavailable(callback: { (streamId: string): void }): void {
    this.streamUnavailableHandler = callback;
  }

  /**
   * Publish media to the Bandwidth WebRTC platform
   *
   * This function can publish an existing MediaStream, or it can create and publish a new media stream from MediaStreamConstraints
   * @param input existing media or specific constraints to publish; optional, defaults to basic audio/video constraints
   * @param audioLevelChangeHandler handler that can be called when the audio level of the published stream changes (optional)
   * @param alias stream alias/tag that will be included in subscription events and billing records, should not be PII (optional)
   */
  async publish(input?: MediaStreamConstraints | MediaStream, audioLevelChangeHandler?: AudioLevelChangeHandler, alias?: string): Promise<RtcStream> {
    // Cast or create a MediaStream from the input
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

    // Create the publishing RTCPeerConnection if this is the first time publishing
    if (!this.publishingPeerConnection) {
      this.setupPublishingPeerConnection();
    }

    logger.info(`Publishing mediaStream ${mediaStream.id} (${alias})`);
    this.addStreamToPublishingPeerConnection(mediaStream);

    if (audioLevelChangeHandler) {
      const audioLevelDetector = new AudioLevelDetector({
        mediaStream: mediaStream,
      });
      audioLevelDetector.on("audioLevelChange", audioLevelChangeHandler);
    }

    // Perform SDP negotiation with Bandwidth WebRTC
    const remoteSdpAnswer = await this.offerPublishSdp();
    const remoteStreamMetadata = remoteSdpAnswer.streamMetadata[mediaStream.id];

    this.publishedStreams.set(mediaStream.id, {
      mediaStream: mediaStream,
      metadata: remoteStreamMetadata,
    });

    return {
      endpointId: mediaStream.id,
      mediaStream: mediaStream,
      mediaTypes: remoteStreamMetadata.mediaTypes,
      alias: alias,
    };
  }

  /**
   * Unpublish one or more streams.
   * @param streams streams to unpublish; leave empty to unpublish all streams
   */
  async unpublish(...streams: RtcStream[] | string[]) {
    logger.info(`Unpublishing media streams ${streams}`);
    let publishedStreams: PublishedStream[] = [];
    for (let stream of streams) {
      if (typeof stream === "string") {
        let s = this.publishedStreams.get(stream);
        if (s) {
          publishedStreams.push(s);
        }
      } else {
        publishedStreams.push({
          mediaStream: stream.mediaStream,
          metadata: {
            endpointId: stream.endpointId,
            mediaTypes: stream.mediaTypes,
            alias: stream.alias,
            participantId: stream.participantId,
          },
        });
      }
    }

    this.cleanupPublishedStreams(...publishedStreams);
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

  /**
   * Enable/disable the mic (audio tracks)
   * @param enabled whether audio streams should be enabled
   * @param stream specific stream to operate on; optional, defaults to all streams
   */
  setMicEnabled(enabled: boolean, stream?: RtcStream | string) {
    logger.info(`Setting microphone enabled: ${enabled}`);
    if (stream && typeof stream !== "string") {
      stream = stream.mediaStream.id;
    }
    [...this.publishedStreams]
      .filter(([msid]) => !stream || stream === msid)
      .forEach(([, stream]) => stream.mediaStream.getAudioTracks().forEach((track) => (track.enabled = enabled)));
  }

  /**
   * Enable/disable the camera (video tracks)
   * @param enabled whether video streams should be enabled
   * @param stream specific stream to operate on; optional, defaults to all streams
   */
  setCameraEnabled(enabled: boolean, stream?: RtcStream | string) {
    logger.info(`Setting camera enabled: ${enabled}`);
    if (stream && typeof stream !== "string") {
      stream = stream.mediaStream.id;
    }
    [...this.publishedStreams]
      .filter(([msid]) => !stream || stream === msid)
      .forEach(([, stream]) => stream.mediaStream.getVideoTracks().forEach((track) => (track.enabled = enabled)));
  }

  /**
   * Disconnect from the Bandwidth WebRTC platform, and tear down all published streams
   */
  disconnect() {
    logger.info("Disconnecting");
    this.signaling.disconnect();
    this.cleanupPublishedStreams();
  }

  private async offerPublishSdp(): Promise<PublishSdpAnswer> {
    if (!this.publishingPeerConnection) {
      throw new BandwidthRtcError("No publishing RTCPeerConnection, cannot offer SDP");
    }

    return await this.publishMutex.runExclusive(async () => {
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
    });
  }

  private async handleSubscribeSdpOffer(subscribeSdpOffer: SubscribeSdpOffer) {
    await this.subscribeMutex.runExclusive(async () => {
      logger.info("Received SDP offer", subscribeSdpOffer);
      logger.debug("Current SDP revision", this.subscribingPeerConnectionSdpRevision);
      if (subscribeSdpOffer.sdpRevision <= this.subscribingPeerConnectionSdpRevision) {
        logger.debug(
          `Revision on SDP offer (${subscribeSdpOffer.sdpRevision}) is less than current revision (${this.subscribingPeerConnectionSdpRevision}), ignoring`
        );
        return;
      }

      this.subscribingPeerConnectionSdpRevision = subscribeSdpOffer.sdpRevision;
      logger.debug(`set current SDP revision to ${this.subscribingPeerConnectionSdpRevision}`);
      const remoteSdpOffer = subscribeSdpOffer.sdpOffer;

      this.subscribedStreams = new Map(Object.entries(subscribeSdpOffer.streamMetadata));
      logger.debug("subscribedStreams", this.subscribedStreams);

      if (!this.subscribingPeerConnection) {
        this.setupSubscribingPeerConnection();
      }

      await this.subscribingPeerConnection!.setRemoteDescription({
        type: "offer",
        sdp: remoteSdpOffer,
      });

      let localSdpAnswer = await this.subscribingPeerConnection!.createAnswer();
      if (!localSdpAnswer.sdp) {
        throw new BandwidthRtcError(`RTCPeerConnection.createAnswer returned ${JSON.stringify(localSdpAnswer)}`);
      }

      // Munge the SDP to change the setup from "actpass" to "passive"
      // This unfortunately seems to be required
      let parsedSdpAnswer = sdpTransform.parse(localSdpAnswer.sdp!);
      parsedSdpAnswer.media.forEach((media) => (media.setup = "passive"));
      localSdpAnswer.sdp = sdpTransform.write(parsedSdpAnswer);

      await this.subscribingPeerConnection!.setLocalDescription(localSdpAnswer);
      await this.signaling.answerSdp(localSdpAnswer.sdp);
    });
  }

  private setupPublishingPeerConnection(): RTCPeerConnection {
    logger.debug("Setting up publishing RTCPeerConnection");
    this.publishingPeerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

    this.setupNewPeerConnection(this.publishingPeerConnection, this.setupPublishingPeerConnection);

    // (Re)publish any existing media streams
    if (this.publishedStreams.size > 0) {
      this.publishedStreams.forEach((publishedStream) => {
        this.addStreamToPublishingPeerConnection(publishedStream.mediaStream);
      });
      this.offerPublishSdp();
    }

    return this.publishingPeerConnection;
  }

  private setupSubscribingPeerConnection(): RTCPeerConnection {
    logger.debug("Setting up subscribing RTCPeerConnection");
    this.subscribingPeerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
    this.subscribingPeerConnectionSdpRevision = 0;

    this.setupNewPeerConnection(this.subscribingPeerConnection, this.setupSubscribingPeerConnection);

    // Map of streams to tracks, used to deduplicate streamAvailable/streamUnavailable events
    let streamTracks: Map<MediaStream, Set<MediaStreamTrack>> = new Map();

    this.subscribingPeerConnection.ontrack = (event: RTCTrackEvent) => {
      logger.debug("ontrack", event);
      const streams: readonly MediaStream[] = event.streams;
      const track: MediaStreamTrack = event.track;

      for (let stream of streams) {
        let availableTracks = streamTracks.get(stream);
        if (!availableTracks) {
          availableTracks = new Set();
          streamTracks.set(stream, availableTracks);
        }
        availableTracks.add(track);

        if (this.streamAvailableHandler) {
          if (stream.getTracks().filter((track) => !availableTracks!.has(track)).length === 0) {
            // All tracks are available
            let remoteStreamMetadata = this.subscribedStreams.get(stream.id)!;
            logger.debug("onStreamAvailable", stream.id);
            this.streamAvailableHandler({
              ...remoteStreamMetadata,
              endpointId: stream.id, // Replace endpointId with streamId
              mediaStream: stream,
            });
          } else {
            logger.debug("Waiting on additional tracks");
          }
        }
      }

      track.onmute = (event) => {
        logger.debug("onmute", event.target);
      };

      track.onunmute = (event) => {
        logger.debug("onunmute", event.target);
      };

      track.onended = (event) => {
        logger.debug("onended", event.target);
        if (this.streamUnavailableHandler) {
          for (let stream of streams) {
            let availableTracks = streamTracks.get(stream);
            availableTracks?.delete(track);
            if (availableTracks?.size === 0) {
              logger.debug("onStreamUnavailable", stream.id);
              this.streamUnavailableHandler(stream.id);
              streamTracks.delete(stream);
            } else {
              logger.debug("Waiting on tracks to end", availableTracks);
            }
          }
        }
      };
    };

    return this.subscribingPeerConnection;
  }

  private setupNewPeerConnection(peerConnection: RTCPeerConnection, onPeerClosed: CallableFunction): void {
    peerConnection.onconnectionstatechange = (event: Event) => {
      const pc = event.target as RTCPeerConnection;
      logger.debug("onconnectionstatechange", pc.connectionState, pc);
      const connectionState = pc.connectionState;
      if (connectionState === "disconnected") {
        logger.warn("Peer disconnected, connection may be reestablished");
      }
      if (connectionState === "failed" || connectionState === "closed") {
        logger.warn("Connection lost, refresh to retry");
        // TODO: make automatic reconnection work
        // onPeerClosed();
      }
    };

    peerConnection.oniceconnectionstatechange = (event) => {
      const pc = event.target as RTCPeerConnection;
      logger.debug("oniceconnectionstatechange", pc.iceConnectionState, pc);
    };

    peerConnection.onicegatheringstatechange = (event) => {
      const pc = event.target as RTCPeerConnection;
      logger.debug("onicegatheringstatechange", pc.iceGatheringState, pc);
    };

    peerConnection.onnegotiationneeded = (event) => {
      logger.debug("onnegotiationneeded", event.target);
    };

    peerConnection.onsignalingstatechange = (event) => {
      const pc = event.target as RTCPeerConnection;
      logger.debug("onsignalingstatechange", pc.signalingState, pc);
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      logger.debug("ontrack", event);
      const track: MediaStreamTrack = event.track;

      track.onmute = (event) => {
        logger.debug("onmute", event.target);
      };

      track.onunmute = (event) => {
        logger.debug("onunmute", event.target);
      };

      track.onended = (event) => {
        logger.debug("onended", event.target);
      };
    };
  }

  private addStreamToPublishingPeerConnection(mediaStream: MediaStream) {
    mediaStream.getTracks().forEach((track) => {
      const transceiver = this.publishingPeerConnection!.addTransceiver(track, {
        direction: "sendonly",
        streams: [mediaStream],
      });

      // Inject DTMF into one audio track in the stream
      if (track.kind === "audio" && !this.localDtmfSenders.has(mediaStream.id)) {
        this.localDtmfSenders.set(mediaStream.id, new DtmfSender(transceiver.sender));
      }
    });
  }

  private cleanupPublishedStreams(...streams: PublishedStream[]) {
    logger.debug(`cleanupPublishedStreams: ${streams}`);
    if (streams.length === 0) {
      streams = Array.from(this.publishedStreams.values());
    }

    for (const stream of streams) {
      stream.mediaStream.getTracks().forEach((track) => {
        this.publishingPeerConnection!.getTransceivers()
          .filter((transceiver) => transceiver.sender.track === track)
          .forEach((transceiver) => {
            transceiver.sender.replaceTrack(null);
            this.publishingPeerConnection!.removeTrack(transceiver.sender);
            transceiver.stop();
          });
        track.stop();
      });
      this.publishedStreams.delete(stream.mediaStream.id);
    }
  }
}

export default BandwidthRtc;
