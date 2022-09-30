if (globalThis.window) {
  require("webrtc-adapter");
}
import jwt_decode from "jwt-decode";

import { AudioLevelChangeHandler, BandwidthRtcError, EnvironmentOptions, RtcAuthParams, RtcOptions, RtcStream } from "./types";
import logger, { LogLevel } from "./logging";

import { BandwidthRtc as BandwidthRtcV3 } from "./v3/bandwidthRtc";
import { CodecPreferences } from "./v3/types";

class BandwidthRtc {
  // Event handlers
  private streamAvailableHandler?: { (event: RtcStream): void };
  private streamUnavailableHandler?: { (endpointId: string): void };

  private logLevel?: LogLevel;
  private delegate?: BandwidthRtcV3;

  constructor(logLevel?: LogLevel) {
    if (logLevel) {
      this.setLogLevel(logLevel);
    }
    this.setMicEnabled = this.setMicEnabled.bind(this);
    this.setCameraEnabled = this.setCameraEnabled.bind(this);
  }

  /**
   * Creates the delegate object using the specific version
   * @param rtcVersion version of Bandwidth WebRTC platform
   * @returns
   */
  private createDelegateObject(rtcVersion: string): BandwidthRtcV3 {
    let delegate: BandwidthRtcV3 | undefined;

    logger.info(`Using device API version ${rtcVersion}`);
    switch (rtcVersion) {
      case "v3": {
        delegate = new BandwidthRtcV3(this.logLevel);
        break;
      }
      default: {
        throw new BandwidthRtcError(`${rtcVersion} is not supported by the Bandwidth WebRTC SDK.`);
      }
    }

    return delegate;
  }

  /**
   * Connect to the Bandwidth WebRTC platform
   * @param authParams connection credentials
   * @param options additional connection options; usually unnecessary
   */
  async connect(authParams: RtcAuthParams, options?: RtcOptions) {
    const jwtPayload = jwt_decode<JwtPayload>(authParams.deviceToken);
    const rtcVersion = jwtPayload.v?.toLowerCase() || "v3";

    const iss = jwtPayload.iss?.toLowerCase();

    if (!!iss) {
      options = { ...options, envOptions: this.getIssuerEnvironmentOptions(iss) };
    }

    this.delegate = this.createDelegateObject(rtcVersion);

    if (this.streamAvailableHandler) {
      this.delegate.onStreamAvailable(this.streamAvailableHandler);
    }

    if (this.streamUnavailableHandler) {
      this.delegate.onStreamUnavailable(this.streamUnavailableHandler);
    }

    return this.delegate.connect(authParams, options);
  }

  /**
   * Set the log level for logs that will appear in the browser's console
   * Defaults to "warn"
   * @param logLevel log level
   */
  setLogLevel(logLevel: LogLevel) {
    this.logLevel = logLevel;
    logger.level = logLevel;
  }

  /**
   * Set the function that will be called when a subscribed stream becomes available
   * @param callback callback function
   */
  onStreamAvailable(callback: { (event: RtcStream): void }): void {
    this.streamAvailableHandler = callback;
    if (this.delegate) {
      this.delegate.onStreamAvailable(callback);
    }
  }

  /**
   * Set the function that will be called when a subscribed stream becomes unavailable
   * @param callback callback function
   */
  onStreamUnavailable(callback: { (streamId: string): void }): void {
    this.streamUnavailableHandler = callback;
    if (this.delegate) {
      this.delegate.onStreamUnavailable(callback);
    }
  }

  /**
   * Publish media to the Bandwidth WebRTC platform
   *
   * This function can publish an existing MediaStream, or it can create and publish a new media stream from MediaStreamConstraints
   * @param input existing media or specific constraints to publish (optional, defaults to basic audio/video constraints)
   * @param audioLevelChangeHandler handler that can be called when the audio level of the published stream changes (optional)
   * @param alias stream alias/tag that will be included in subscription events and billing records, should not be PII (optional)
   * @param codecPreferences preferred audio and video codecs (optional, should almost never be needed)
   */
  async publish(
    input?: MediaStreamConstraints | MediaStream,
    audioLevelChangeHandler?: AudioLevelChangeHandler,
    alias?: string,
    codecPreferences?: CodecPreferences
  ): Promise<RtcStream> {
    if (!this.delegate) {
      throw new BandwidthRtcError("You must call 'connect' before 'publish'");
    }

    return this.delegate.publish(input, audioLevelChangeHandler, alias, codecPreferences);
  }

  /**
   * Unpublish one or more streams.
   * @param streams streams to unpublish; leave empty to unpublish all streams
   */
  async unpublish(...streams: RtcStream[] | string[]) {
    if (!this.delegate) {
      throw new BandwidthRtcError("You must call 'connect' before 'unpublish'");
    }

    // @ts-ignore
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
      throw new BandwidthRtcError("You must call 'connect' before 'sendDtmf'");
    }

    return this.delegate.sendDtmf(tone, streamId);
  }

  /**
   * Enable/disable the mic (audio tracks)
   * @param enabled whether audio streams should be enabled
   * @param stream specific stream to operate on; optional, defaults to all streams
   */
  setMicEnabled(enabled: boolean, stream?: RtcStream | string) {
    if (!this.delegate) {
      throw new BandwidthRtcError("You must call 'connect' before 'setMicEnabled'");
    }

    // @ts-ignore
    return this.delegate.setMicEnabled(enabled, stream);
  }

  /**
   * Enable/disable the camera (video tracks)
   * @param enabled whether video streams should be enabled
   * @param stream specific stream to operate on; optional, defaults to all streams
   */
  setCameraEnabled(enabled: boolean, stream?: RtcStream | string) {
    if (!this.delegate) {
      throw new BandwidthRtcError("You must call 'connect' before 'setCameraEnabled'");
    }

    // @ts-ignore
    return this.delegate.setCameraEnabled(enabled, stream);
  }

  /**
   * Disconnect from the Bandwidth WebRTC platform, and tear down all published streams
   */
  disconnect() {
    if (!this.delegate) {
      throw new BandwidthRtcError("You must call 'connect' before 'disconnect'");
    }

    return this.delegate.disconnect();
  }

  /**
   * Extract from the issuer the environment information
   * The general form of the issuer string is
   *  `<environment>:<region_code>[:<subdomain>]`
   *  where:
   *    <environment> is a three character code for the teri of the
   *    environment (dev, stg, prd ...)
   *    <region_code> is a two digit regional code assigned to aws regions
   *    See `RegionCode` for a list of regions and codes
   *    <subdomain> an optional subdomain to be used within a region and
   *    environment
   * @param iss
   * @private
   */
  private getIssuerEnvironmentOptions(iss: string): EnvironmentOptions {
    const parts: string[] = iss.split(":");

    return {
      environment: parts[0],
      geoRegion: parts[1],
      subdomain: parts.length >= 3 ? parts[2] : "",
    } as EnvironmentOptions;
  }
}

interface JwtPayload {
  a?: string;
  p?: string;
  v?: string;
  exp?: string;
  tid?: string;
  iss?: string;
}

export default BandwidthRtc;
