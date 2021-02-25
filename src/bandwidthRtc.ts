require("webrtc-adapter");
import jwt_decode from "jwt-decode";

import { AudioLevelChangeHandler, RtcAuthParams, RtcOptions, RtcStream } from "./types";
import logger, { LogLevel } from "./logging";

import { default as BandwidthRtcV2 } from "./v2/bandwidthRtc";
import { default as BandwidthRtcV3 } from "./v3/bandwidthRtc";

interface JwtPayload {
  a: string;
  p: string;
  v: string;
  exp: string;
  tid?: string;
  iss?: string;
}

class BandwidthRtc {
  // Event handlers
  private streamAvailableHandler?: { (event: RtcStream): void };
  private streamUnavailableHandler?: { (endpointId: string): void };

  private logLevel?: LogLevel;
  private delegate?: BandwidthRtcV2 | BandwidthRtcV3;

  constructor(logLevel?: LogLevel) {
    if (logLevel) {
      this.logLevel = logLevel;
    }
  }

  async connect(authParams: RtcAuthParams, options?: RtcOptions) {
    const jwtPayload = jwt_decode<JwtPayload>(authParams.deviceToken);
    if (jwtPayload.v.toLowerCase() === "v3") {
      console.info("Using device API version 3");
      this.delegate = new BandwidthRtcV3(this.logLevel);
    } else {
      console.info("Using device API version 2");
      this.delegate = new BandwidthRtcV2();
    }

    if (this.streamAvailableHandler) {
      this.delegate.onStreamAvailable(this.streamAvailableHandler);
    }

    if (this.streamUnavailableHandler) {
      this.delegate.onStreamUnavailable(this.streamUnavailableHandler);
    }

    return this.delegate.connect(authParams, options);
  }

  onStreamAvailable(callback: { (event: RtcStream): void }): void {
    this.streamAvailableHandler = callback;
    if (this.delegate) {
      this.delegate.onStreamAvailable(callback);
    }
  }

  onStreamUnavailable(callback: { (endpointId: string): void }): void {
    this.streamUnavailableHandler = callback;
    if (this.delegate) {
      this.delegate.onStreamUnavailable(callback);
    }
  }

  async publish(input?: MediaStreamConstraints | MediaStream, audioLevelChangeHandler?: AudioLevelChangeHandler, alias?: string): Promise<RtcStream> {
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'publish'");
    }

    return this.delegate.publish(input, audioLevelChangeHandler, alias);
  }

  async unpublish(...streams: string[]) {
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'unpublish'");
    }

    return this.delegate.unpublish(...streams);
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
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'sendDtmf'");
    }

    return this.delegate.sendDtmf(tone, streamId);
  }

  setMicEnabled(enabled: boolean, streamId?: string) {
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'setMicEnabled'");
    }

    return this.delegate.setMicEnabled(enabled, streamId);
  }

  setCameraEnabled(enabled: boolean, streamId?: string) {
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'setCameraEnabled'");
    }

    return this.delegate.setCameraEnabled(enabled, streamId);
  }

  disconnect() {
    if (!this.delegate) {
      throw new Error("You must call 'connect' before 'disconnect'");
    }

    return this.delegate.disconnect();
  }
}

export default BandwidthRtc;
