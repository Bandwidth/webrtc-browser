if (globalThis.window) {
  require("webrtc-adapter");
}
import { Mutex } from "async-mutex";
import * as sdpTransform from "sdp-transform";

import { AudioLevelChangeHandler, BandwidthRtcError, MediaType, RtcAuthParams, RtcOptions, RtcStream } from "../types";
import { PublishSdpAnswer, PublishedStream, StreamMetadata, SubscribeSdpOffer, CodecPreferences, StreamPublishMetadata } from "./types";
import Signaling from "./signaling";
import AudioLevelDetector from "../audioLevelDetector";
import { DiagnosticsBatcher } from "./diagnostics";
import logger, { LogLevel } from "../logging";

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};
const HEARTBEAT_DATA_CHANNEL_LABEL = "__heartbeat__";
const DIAGNOSTICS_DATA_CHANNEL_LABEL = "__diagnostics__";

export class BandwidthRtc {
  // Batches diagnostic data for debugging
  private diagnosticsBatcher: DiagnosticsBatcher;

  // Communicates with the Bandwidth WebRTC platform
  private signaling: Signaling;

  // One peer for all published (outgoing) streams, one for all subscribed (incoming) streams
  private publishingPeerConnection?: RTCPeerConnection;
  private subscribingPeerConnection?: RTCPeerConnection;

  // Standard datachannels used for platform diagnostics and health checks
  private publishHeartbeatDataChannel?: RTCDataChannel;
  private publishDiagnosticsDataChannel?: RTCDataChannel;
  private publishedDataChannels: Map<string, RTCDataChannel> = new Map();
  private subscribeHeartbeatDataChannel?: RTCDataChannel;
  private subscribeDiagnosticsDataChannel?: RTCDataChannel;
  private subscribedDataChannels: Map<string, RTCDataChannel> = new Map();

  // Prevents concurrent modification to RTCPeerConnection state (can cause race conditions)
  private publishMutex: Mutex = new Mutex();
  private subscribeMutex: Mutex = new Mutex();

  // Lookup maps for streams, keyed by mediastream id (msid)
  private publishedStreams: Map<string, PublishedStream> = new Map();
  private subscribedStreams: Map<string, StreamMetadata> = new Map();

  // Current SDP revision for the subscribing peer; used to reject outdated SDP offers
  private subscribingPeerConnectionSdpRevision = 0;

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

    this.diagnosticsBatcher = new DiagnosticsBatcher();
    this.signaling = new Signaling(this.diagnosticsBatcher);

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
  async publish(
    input?: MediaStreamConstraints | MediaStream,
    audioLevelChangeHandler?: AudioLevelChangeHandler,
    alias?: string,
    codecPreferences?: CodecPreferences
  ): Promise<RtcStream> {
    // Cast or create a MediaStream from the input
    let mediaStream: MediaStream;
    if (input && this.isMediaStream(input)) {
      // @ts-ignore
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
      await this.setupPublishingPeerConnection();
    }

    logger.info(`Publishing mediaStream ${mediaStream.id} (${alias})`);
    this.addStreamToPublishingPeerConnection(mediaStream, codecPreferences);

    const publishMetadata: StreamPublishMetadata = {};
    if (alias) {
      publishMetadata.alias = alias;
    }
    this.publishedStreams.set(mediaStream.id, {
      mediaStream: mediaStream,
      metadata: publishMetadata,
    });

    if (audioLevelChangeHandler) {
      const audioLevelDetector = new AudioLevelDetector({
        mediaStream: mediaStream,
      });
      audioLevelDetector.on("audioLevelChange", audioLevelChangeHandler);
    }

    // Perform SDP negotiation with Bandwidth WebRTC
    const remoteSdpAnswer = await this.offerPublishSdp();
    const remoteStreamMetadata = remoteSdpAnswer.streamMetadata[mediaStream.id];

    return {
      endpointId: mediaStream.id,
      mediaStream: mediaStream,
      mediaTypes: remoteStreamMetadata ? remoteStreamMetadata.mediaTypes : [MediaType.APPLICATION],
      alias: alias,
    };
  }

  /**
   * Unpublish one or more streams.
   * @param streams streams to unpublish; leave empty to unpublish all streams
   */
  async unpublish(...streams: RtcStream[] | string[]) {
    logger.info("Unpublishing media streams", streams);
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
        });
      }
    }

    this.cleanupPublishedStreams(...publishedStreams);
    await this.offerPublishSdp();
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
    throw new BandwidthRtcError("DTMF support is not yet implemented");
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

  private async offerPublishSdp(restartIce: boolean = false): Promise<PublishSdpAnswer> {
    if (!this.publishingPeerConnection) {
      throw new BandwidthRtcError("No publishing RTCPeerConnection, cannot offer SDP");
    }

    return await this.publishMutex.runExclusive(async () => {
      const localSdpOffer = await this.publishingPeerConnection!.createOffer({
        offerToReceiveVideo: false,
        offerToReceiveAudio: false,
        voiceActivityDetection: true,
        iceRestart: restartIce,
      });

      let publishMetadata = {
        mediaStreams: {},
        dataChannels: {},
      };
      publishMetadata.mediaStreams = Object.fromEntries(new Map([...this.publishedStreams].map(([streamId, stream]) => [streamId, stream.metadata || {}])));
      publishMetadata.dataChannels = Object.fromEntries(
        new Map(
          [...this.publishedDataChannels].map(([label, dataChannel]) => [
            label,
            {
              label: dataChannel.label,
              streamId: dataChannel.id,
            },
          ])
        )
      );
      logger.debug("publish metadata", publishMetadata);
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

      const remoteSdpOffer = subscribeSdpOffer.sdpOffer;

      this.subscribedStreams = new Map(Object.entries(subscribeSdpOffer.streamMetadata));
      logger.debug("subscribedStreams", this.subscribedStreams);

      if (!this.subscribingPeerConnection) {
        await this.setupSubscribingPeerConnection();
      }

      try {
        // Munge the SDP to change the setup to "actpass"
        // This unfortunately seems to be required
        let parsedSdpOffer = sdpTransform.parse(remoteSdpOffer);
        parsedSdpOffer.media.forEach((media) => {
          if (!media.direction) {
            media.setup = "actpass";
          }
        });
        let mungedRemoteSdpOffer = sdpTransform.write(parsedSdpOffer);
        await this.subscribingPeerConnection!.setRemoteDescription({
          type: "offer",
          sdp: mungedRemoteSdpOffer,
        });
      } catch (err) {
        throw new BandwidthRtcError(err);
      }

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

      this.subscribingPeerConnectionSdpRevision = subscribeSdpOffer.sdpRevision;
      logger.debug(`set current SDP revision to ${this.subscribingPeerConnectionSdpRevision}`);
    });
  }

  private addHeartbeatDataChannel(peerConnection: RTCPeerConnection): RTCDataChannel {
    //Create a heartbeat data channel
    let heartbeatDataChannel = peerConnection.createDataChannel(HEARTBEAT_DATA_CHANNEL_LABEL, {
      id: 0,
      negotiated: true,
      protocol: "udp",
    });
    heartbeatDataChannel.onmessage = (event) => {
      logger.debug("Heartbeat Received:", event.data);
      if (event.data === "PING") {
        heartbeatDataChannel.send("PONG");
      }
    };
    return heartbeatDataChannel;
  }

  private addDiagnosticsDataChannel(peerConnection: RTCPeerConnection): RTCDataChannel {
    //Create a diagnostics data channel
    let diagnosticsDataChannel = peerConnection.createDataChannel(DIAGNOSTICS_DATA_CHANNEL_LABEL, {
      id: 1,
      negotiated: true,
      protocol: "udp",
    });
    diagnosticsDataChannel.onmessage = (event) => {
      logger.info("Diagnostics Received:", event.data);
    };
    return diagnosticsDataChannel;
  }

  private async setupPublishingPeerConnection(): Promise<RTCPeerConnection> {
    logger.debug("Setting up publishing RTCPeerConnection");
    this.publishingPeerConnection = this.createPeerConnection();

    this.setupNewPeerConnection(this.publishingPeerConnection);
    // Attempt to restart ice if connection fails
    this.publishingPeerConnection!.onconnectionstatechange = async (event: Event) => {
      const pc = event.target as RTCPeerConnection;
      let connectionState = pc.connectionState;
      if (connectionState === "failed") {
        await this.offerPublishSdp(true);
        connectionState = pc.connectionState;
        //TODO: add timeout so we dont loop here forever
        while (connectionState === "failed") {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          //Dont block on this, we should try multiple times
          this.offerPublishSdp(true);
          connectionState = pc.connectionState;
        }
      }
    };

    const heartbeatDataChannel = this.addHeartbeatDataChannel(this.publishingPeerConnection);
    this.publishedDataChannels.set(heartbeatDataChannel.label, heartbeatDataChannel);
    this.publishHeartbeatDataChannel = heartbeatDataChannel;
    const diagnosticDataChannel = this.addDiagnosticsDataChannel(this.publishingPeerConnection);
    this.publishedDataChannels.set(diagnosticDataChannel.label, diagnosticDataChannel);
    this.publishDiagnosticsDataChannel = diagnosticDataChannel;
    await this.offerPublishSdp();

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
    logger.debug("Setting up subscribing RTCPeerConnection");
    this.subscribingPeerConnection = this.createPeerConnection();
    this.subscribingPeerConnectionSdpRevision = 0;

    this.setupNewPeerConnection(this.subscribingPeerConnection);
    const heartbeatDataChannel = this.addHeartbeatDataChannel(this.subscribingPeerConnection);
    this.subscribedDataChannels.set(heartbeatDataChannel.label, heartbeatDataChannel);
    this.subscribeHeartbeatDataChannel = heartbeatDataChannel;
    const diagnosticDataChannel = this.addDiagnosticsDataChannel(this.subscribingPeerConnection);
    this.subscribedDataChannels.set(diagnosticDataChannel.label, diagnosticDataChannel);
    this.subscribeDiagnosticsDataChannel = diagnosticDataChannel;

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

  private setupNewPeerConnection(peerConnection: RTCPeerConnection): void {
    peerConnection.onconnectionstatechange = (event) => {
      try {
        const pc = event.target as RTCPeerConnection;
        logger.debug("onconnectionstatechange", pc.connectionState, pc);
        const connectionState = pc.connectionState;
        if (connectionState === "disconnected") {
          logger.warn("Peer disconnected, connection may be reestablished");
        }
      } catch (err) {
        if (globalThis.window) {
          logger.warn("onconnectionstatechange error", err);
        }
      }
    };

    peerConnection.oniceconnectionstatechange = (event) => {
      try {
        const pc = event.target as RTCPeerConnection;
        logger.debug("oniceconnectionstatechange", pc.iceConnectionState, pc);
      } catch (err) {
        if (globalThis.window) {
          logger.warn("oniceconnectionstatechange error", err);
        }
      }
    };

    peerConnection.onicegatheringstatechange = (event) => {
      try {
        const pc = event.target as RTCPeerConnection;
        logger.debug("onicegatheringstatechange", pc.iceGatheringState, pc);
      } catch (err) {
        if (globalThis.window) {
          logger.warn("onicegatheringstatechange error", err);
        }
      }
    };

    peerConnection.onnegotiationneeded = (event) => {
      try {
        logger.debug("onnegotiationneeded", event.target);
      } catch (err) {
        if (globalThis.window) {
          logger.warn("onnegotiationneeded error", err);
        }
      }
    };

    peerConnection.onsignalingstatechange = (event) => {
      try {
        const pc = event.target as RTCPeerConnection;
        logger.debug("onsignalingstatechange", pc.signalingState, pc);
      } catch (err) {
        if (globalThis.window) {
          logger.warn("onsignalingstatechange error", err);
        }
      }
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

  private addStreamToPublishingPeerConnection(mediaStream: MediaStream, codecPreferences?: CodecPreferences) {
    mediaStream.getTracks().forEach((track) => {
      const transceiver = this.publishingPeerConnection!.addTransceiver(track, {
        direction: "sendonly",
        streams: [mediaStream],
      });

      if (codecPreferences) {
        if (track.kind === "audio" && codecPreferences.audio) {
          transceiver.setCodecPreferences(codecPreferences.audio);
        } else if (track.kind === "video" && codecPreferences.video) {
          transceiver.setCodecPreferences(codecPreferences.video);
        }
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

  /**
   * Can be overridden in environments where RTCPeerConnection is not natively present
   * @returns new RTCPeerConnection
   */
  private createPeerConnection() {
    return new RTCPeerConnection(RTC_CONFIGURATION);
  }

  /**
   * Can be overridden in environments where MediaStream is not natively present
   * @returns true if input is a MediaStream, false otherwise
   */
  private isMediaStream(input: MediaStreamConstraints | MediaStream) {
    return input instanceof MediaStream;
  }
}
