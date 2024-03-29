const sdkVersion = require("../../package.json").version;
import { v4 as uuid } from "uuid";
import { EventEmitter } from "events";
import { Client as JsonRpcClient } from "rpc-websockets";
import logger from "../logging";
import { RtcAuthParams, RtcOptions } from "../types";
import { PublishSdpAnswer, PublishMetadata } from "./types";
import { Diagnostics, DiagnosticsBatcher } from "./diagnostics";

class Signaling extends EventEmitter {
  private defaultWebsocketUrl: string = "wss://device.webrtc.bandwidth.com";
  private ws: JsonRpcClient | null = null;
  private pingInterval?: NodeJS.Timeout;
  private uniqueDeviceId: string = uuid();
  private hasSetMediaPreferences: boolean = false;
  private diagnosticsBatcher?: DiagnosticsBatcher;

  constructor(diagnosticsBatcher?: DiagnosticsBatcher) {
    super();
    if (diagnosticsBatcher) {
      this.diagnosticsBatcher = diagnosticsBatcher;
      this.diagnosticsBatcher.on("diagnostics", this.sendDiagnostics.bind(this));
    }
  }

  connect(authParams: RtcAuthParams, options?: RtcOptions) {
    return new Promise<void>((resolve, reject) => {
      let rtcOptions: RtcOptions = {
        websocketUrl: this.defaultWebsocketUrl,
      };

      if (options) {
        rtcOptions = { ...rtcOptions, ...options };
      }
      const websocketUrl = `${rtcOptions.websocketUrl}/v3/?token=${authParams.deviceToken}&client=browser&sdkVersion=${sdkVersion}&uniqueId=${this.uniqueDeviceId}`;
      logger.debug(`Connecting to ${websocketUrl}`);
      const ws = new JsonRpcClient(websocketUrl, {
        max_reconnects: 0, // Unlimited
      });
      this.ws = ws;

      ws.on("sdpOffer", (event) => {
        this.emit("sdpOffer", event);
      });

      ws.on("open", async () => {
        logger.debug("Websocket open");
        if (globalThis.addEventListener) {
          globalThis.addEventListener("beforeunload", (event) => {
            this.disconnect();
          });
        }
        if (!this.hasSetMediaPreferences) {
          await this.setMediaPreferences();
          this.hasSetMediaPreferences = true;
        }
        this.pingInterval = setInterval(() => {
          ws.call("ping", {});
        }, 300000);
        logger.debug("Websocket ready");
        resolve();
      });

      ws.on("error", (error) => {
        // TODO: make this a more informative error message
        logger.error(`Websocket error: ${JSON.stringify(error)}`);
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
        }
      });

      ws.on("close", (code) => {
        logger.debug(`Websocket closed: ${code}`);
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
        }
      });
    });
  }

  disconnect() {
    logger.debug("Disconnecting websocket");
    if (this.ws) {
      this.ws.notify("leave");
      if (this.diagnosticsBatcher) {
        const finalDiagnostics = this.diagnosticsBatcher.getDiagnostics();
        this.sendDiagnostics(finalDiagnostics);
      }
      logger.debug("Setting hasSetMediaPreferences to false");
      this.hasSetMediaPreferences = false;
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  offerSdp(sdpOffer: string, metadata: PublishMetadata): Promise<PublishSdpAnswer> {
    logger.debug(`Calling "offerSdp"`, { sdpOffer: sdpOffer, mediaMetadata: metadata });
    return this.ws?.call("offerSdp", {
      sdpOffer: sdpOffer,
      mediaMetadata: metadata,
    }) as Promise<PublishSdpAnswer>;
  }

  answerSdp(sdpAnswer: string): Promise<void> {
    logger.debug(`Calling "answerSdp"`, { sdpAnswer: sdpAnswer });
    return this.ws?.call("answerSdp", {
      sdpAnswer: sdpAnswer,
    }) as Promise<void>;
  }

  private setMediaPreferences(): Promise<{}> {
    logger.debug(`Calling "setMediaPreferences"`, { protocol: "WEBRTC" });
    return this.ws?.call("setMediaPreferences", {
      protocol: "WEBRTC",
    }) as Promise<{}>;
  }

  private sendDiagnostics(diagnostics: Diagnostics): Promise<void> {
    logger.debug(`Calling "deviceDiagnostics"`);
    return this.ws?.notify("deviceDiagnostics", diagnostics) as Promise<void>;
  }
}

export default Signaling;
