"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var sdkVersion = require("../package.json").version;
var events_1 = require("events");
var rpc_websockets_1 = require("rpc-websockets");
var types_1 = require("./types");
var Signaling = /** @class */ (function (_super) {
    __extends(Signaling, _super);
    function Signaling() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.defaultWebsocketUrl = "wss://device.webrtc.bandwidth.com";
        _this.ws = null;
        return _this;
    }
    Signaling.prototype.Signaling = function () { };
    Signaling.prototype.connect = function (authParams, options) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var rtcOptions = {
                websocketUrl: _this.defaultWebsocketUrl,
            };
            if (options) {
                rtcOptions = __assign(__assign({}, rtcOptions), options);
            }
            var websocketUrl = rtcOptions.websocketUrl + "/v2/?token=" + authParams.deviceToken + "&sdkVersion=" + sdkVersion;
            var ws = new rpc_websockets_1.Client(websocketUrl, {
                max_reconnects: 0,
            });
            _this.ws = ws;
            ws.addListener("sdpNeeded", function (event) { return _this.emit("sdpNeeded", event); });
            ws.addListener("addIceCandidate", function (event) { return _this.emit("addIceCandidate", event); });
            ws.addListener("endpointRemoved", function (event) { return _this.emit("endpointRemoved", event); });
            ws.on("open", function () { return __awaiter(_this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            window.addEventListener("unload", function (event) {
                                _this.disconnect();
                            });
                            return [4 /*yield*/, this.setMediaPreferences()];
                        case 1:
                            _a.sent();
                            this.pingInterval = setInterval(function () {
                                ws.call("ping", {});
                            }, 300000);
                            resolve();
                            return [2 /*return*/];
                    }
                });
            }); });
            ws.on("error", function (error) {
                if (_this.pingInterval) {
                    clearInterval(_this.pingInterval);
                }
            });
            ws.on("close", function (code) {
                if (_this.pingInterval) {
                    clearInterval(_this.pingInterval);
                }
            });
        });
    };
    Signaling.prototype.disconnect = function () {
        if (this.ws) {
            this.ws.notify("leave");
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
    };
    Signaling.prototype.requestToPublish = function (mediaTypes) {
        var _a;
        return (_a = this.ws) === null || _a === void 0 ? void 0 : _a.call("requestToPublish", {
            mediaTypes: mediaTypes,
        });
    };
    Signaling.prototype.offerSdp = function (sdpOffer, endpointId) {
        var _a;
        return (_a = this.ws) === null || _a === void 0 ? void 0 : _a.call("offerSdp", {
            sdpOffer: sdpOffer,
            endpointId: endpointId,
        });
    };
    Signaling.prototype.sendIceCandidate = function (endpointId, candidate) {
        var _a;
        if (candidate && candidate.sdpMid && candidate.sdpMLineIndex != null && !candidate.candidate.includes("host")) {
            var params = {
                endpointId: endpointId,
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex,
            };
            (_a = this.ws) === null || _a === void 0 ? void 0 : _a.call("addIceCandidate", params);
        }
    };
    Signaling.prototype.setMediaPreferences = function (sendRecv, aggregationType) {
        var _a;
        if (sendRecv === void 0) { sendRecv = false; }
        if (aggregationType === void 0) { aggregationType = types_1.MediaAggregationType.NONE; }
        return (_a = this.ws) === null || _a === void 0 ? void 0 : _a.call("setMediaPreferences", {
            sendRecv: sendRecv,
            aggregationType: aggregationType,
            protocol: "WEB_RTC",
        });
    };
    return Signaling;
}(events_1.EventEmitter));
exports.default = Signaling;
//# sourceMappingURL=signaling.js.map