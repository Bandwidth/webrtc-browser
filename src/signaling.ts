const sdkVersion = require("../package.json").version;
import { v4 as uuid } from "uuid";
import { EventEmitter } from "events";
import { Client as JsonRpcClient } from "rpc-websockets";
import { MediaAggregationType, RtcAuthParams, RtcOptions, MediaType, SdpRequest, SdpResponse } from "./types";

class Signaling extends EventEmitter {
  private defaultWebsocketUrl: string = "wss://device.webrtc.bandwidth.com";
  private ws: JsonRpcClient | null = null;
  private pingInterval?: NodeJS.Timeout;
  private uniqueDeviceId: string = uuid();

  Signaling() {}

  connect(authParams: RtcAuthParams, options?: RtcOptions) {
    return new Promise((resolve, reject) => {
      let rtcOptions: RtcOptions = {
        websocketUrl: this.defaultWebsocketUrl,
      };

      if (options) {
        rtcOptions = { ...rtcOptions, ...options };
      }
      const websocketUrl = `${rtcOptions.websocketUrl}/v2/?token=${authParams.deviceToken}&sdkVersion=${sdkVersion}&uniqueId=${this.uniqueDeviceId}`;
      const ws = new JsonRpcClient(websocketUrl, {
        max_reconnects: 0, // Unlimited
      });
      this.ws = ws;
      ws.addListener("sdpNeeded", (event) => this.emit("sdpNeeded", event));
      ws.addListener("addIceCandidate", (event) => this.emit("addIceCandidate", event));
      ws.addListener("endpointRemoved", (event) => this.emit("endpointRemoved", event));
      
      const hasMediaPreferences = false;

      ws.on("open", async () => {
        window.addEventListener("unload", (event) => {
          this.disconnect();
        });
	 if (!this.hasMediaPreferences) {
	   await this.setMediaPreferences();
	   this.hasMediaPreferences = true;	
	 }
        resolve();
      });

      ws.on("error", (error) => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
        }
      });

      ws.on("close", (code) => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
        }
      });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.notify("leave");
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  requestToPublish(mediaTypes: MediaType[], alias?: string): Promise<SdpRequest> {
    let params: object;
    if (alias) {
      params = {
        mediaTypes: mediaTypes,
        alias: alias,
      };
    } else {
      params = {
        mediaTypes: mediaTypes,
      };
    }
    return this.ws?.call("requestToPublish", params) as Promise<SdpRequest>;
  }

  offerSdp(sdpOffer: string, endpointId: string): Promise<SdpResponse> {
    return this.ws?.call("offerSdp", {
      sdpOffer: sdpOffer,
      endpointId: endpointId,
    }) as Promise<SdpResponse>;
  }

  sendIceCandidate(endpointId: string, candidate: RTCIceCandidate | null) {
    if (candidate && candidate.sdpMid && candidate.sdpMLineIndex != null && !candidate.candidate.includes("host")) {
      let params = {
        endpointId: endpointId,
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      };
      this.ws?.notify("addIceCandidate", params);
    }
  }

  unpublish(endpointId: string) {
    this.ws?.notify("unpublish", {
      endpointId: endpointId,
    });
  }

  private setMediaPreferences(sendRecv = false, aggregationType = MediaAggregationType.NONE): Promise<{}> {
    return this.ws?.call("setMediaPreferences", {
      sendRecv: sendRecv,
      aggregationType: aggregationType,
      protocol: "WEB_RTC",
    }) as Promise<{}>;
  }
}

export default Signaling;
