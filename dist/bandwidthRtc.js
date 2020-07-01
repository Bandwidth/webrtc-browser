"use strict";
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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("webrtc-adapter");
var types_1 = require("./types");
var signaling_1 = __importDefault(require("./signaling"));
var audioLevelDetector_1 = __importDefault(require("./audioLevelDetector"));
var DTMFSender_1 = __importDefault(require("./DTMFSender"));
var RTC_CONFIGURATION = {
    iceServers: [],
};
var BandwidthRtc = /** @class */ (function () {
    function BandwidthRtc() {
        // Signaling
        this.signaling = new signaling_1.default();
        // WebRTC
        this.localPeerConnections = new Map();
        this.localStreams = new Map();
        this.remotePeerConnections = new Map();
        this.iceCandidateQueues = new Map();
        // DTMF
        this.dtmfSender = null;
        this.setMicEnabled = this.setMicEnabled.bind(this);
        this.setCameraEnabled = this.setCameraEnabled.bind(this);
    }
    BandwidthRtc.prototype.sendDtmf = function (tones) {
        if (this.dtmfSender != null) {
            this.dtmfSender.insertDTMF(tones);
        }
    };
    BandwidthRtc.prototype.connect = function (authParams, options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.createSignalingBroker();
                this.signaling.addListener("sdpNeeded", this.handleSdpNeededEvent.bind(this));
                this.signaling.addListener("addIceCandidate", this.handleIceCandidateEvent.bind(this));
                this.signaling.addListener("endpointRemoved", this.handleEndpointRemovedEvent.bind(this));
                return [2 /*return*/, this.signaling.connect(authParams, options)];
            });
        });
    };
    BandwidthRtc.prototype.onStreamAvailable = function (callback) {
        this.streamAvailableHandler = callback;
    };
    BandwidthRtc.prototype.onStreamUnavailable = function (callback) {
        this.streamUnavailableHandler = callback;
    };
    BandwidthRtc.prototype.publish = function (input, audioLevelChangeHandler) {
        return __awaiter(this, void 0, void 0, function () {
            var mediaStream, constraints, mediaTypes, sdpRequest, endpointId, audioLevelDetector, peerConnection;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        constraints = { audio: true, video: true };
                        if (!(input instanceof MediaStream)) return [3 /*break*/, 1];
                        mediaStream = input;
                        return [3 /*break*/, 3];
                    case 1:
                        if (typeof input === "object") {
                            constraints = input;
                        }
                        return [4 /*yield*/, navigator.mediaDevices.getUserMedia(constraints)];
                    case 2:
                        mediaStream = _a.sent();
                        _a.label = 3;
                    case 3:
                        mediaTypes = [];
                        if (mediaStream.getAudioTracks().length > 0) {
                            mediaTypes.push(types_1.MediaType.AUDIO);
                        }
                        if (mediaStream.getVideoTracks().length > 0) {
                            mediaTypes.push(types_1.MediaType.VIDEO);
                        }
                        return [4 /*yield*/, this.signaling.requestToPublish(mediaTypes)];
                    case 4:
                        sdpRequest = _a.sent();
                        endpointId = sdpRequest.endpointId;
                        if (audioLevelChangeHandler) {
                            audioLevelDetector = new audioLevelDetector_1.default({
                                mediaStream: mediaStream,
                            });
                            audioLevelDetector.on("audioLevelChange", audioLevelChangeHandler);
                        }
                        peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
                        this.setupNewPeerConnection(peerConnection, endpointId, mediaTypes);
                        mediaStream.getTracks().forEach(function (track) {
                            console.log("track = " + track.label + ", kind = " + track.kind);
                            var sender = peerConnection.addTrack(track, mediaStream);
                            if (track.kind === "audio") {
                                _this.dtmfSender = new DTMFSender_1.default(sender);
                            }
                        });
                        this.localPeerConnections.set(endpointId, peerConnection);
                        this.localStreams.set(endpointId, mediaStream);
                        return [4 /*yield*/, this.negotiateSdp(sdpRequest, peerConnection)];
                    case 5:
                        _a.sent();
                        return [2 /*return*/, {
                                endpointId: endpointId,
                                mediaStream: mediaStream,
                                mediaTypes: mediaTypes,
                            }];
                }
            });
        });
    };
    BandwidthRtc.prototype.unpublish = function () {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i] = arguments[_i];
        }
        return __awaiter(this, void 0, void 0, function () {
            var streams_1, streams_1_1, s;
            var e_1, _a;
            return __generator(this, function (_b) {
                if (streams.length === 0) {
                    streams = Array.from(this.localStreams.keys());
                }
                try {
                    for (streams_1 = __values(streams), streams_1_1 = streams_1.next(); !streams_1_1.done; streams_1_1 = streams_1.next()) {
                        s = streams_1_1.value;
                        // TODO: notify the platform?
                        this.cleanupLocalStreams(s);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (streams_1_1 && !streams_1_1.done && (_a = streams_1.return)) _a.call(streams_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                return [2 /*return*/];
            });
        });
    };
    BandwidthRtc.prototype.setMicEnabled = function (enabled, streamId) {
        var _a;
        if (streamId) {
            (_a = this.localStreams
                .get(streamId)) === null || _a === void 0 ? void 0 : _a.getAudioTracks().forEach(function (track) { return (track.enabled = enabled); });
        }
        else {
            this.localStreams.forEach(function (stream) { return stream.getAudioTracks().forEach(function (track) { return (track.enabled = enabled); }); });
        }
    };
    BandwidthRtc.prototype.setCameraEnabled = function (enabled, streamId) {
        var _a;
        if (streamId) {
            (_a = this.localStreams
                .get(streamId)) === null || _a === void 0 ? void 0 : _a.getVideoTracks().forEach(function (track) { return (track.enabled = enabled); });
        }
        else {
            this.localStreams.forEach(function (stream) { return stream.getVideoTracks().forEach(function (track) { return (track.enabled = enabled); }); });
        }
    };
    BandwidthRtc.prototype.disconnect = function () {
        this.signaling.disconnect();
        this.stopLocalMedia();
        this.localStreams = new Map();
    };
    BandwidthRtc.prototype.createSignalingBroker = function () {
        this.signaling = new signaling_1.default();
    };
    BandwidthRtc.prototype.handleIceCandidateEvent = function (event) {
        var endpointId = event.endpointId;
        var candidate = event.candidate;
        var rtcPeerConnection = this.remotePeerConnections.get(endpointId) || this.localPeerConnections.get(endpointId);
        if (rtcPeerConnection && rtcPeerConnection.currentRemoteDescription) {
            // If we have already created a peer connection and set its remote description, just add the candidate
            rtcPeerConnection.addIceCandidate(candidate);
        }
        else {
            // Otherwise, we will need to put the candidate on a queue until the remote description is set
            var remoteIceCandidates = this.iceCandidateQueues.get(endpointId);
            if (remoteIceCandidates) {
                remoteIceCandidates.push(candidate);
            }
            else {
                this.iceCandidateQueues.set(endpointId, [candidate]);
            }
        }
    };
    BandwidthRtc.prototype.handleEndpointRemovedEvent = function (event) {
        if (this.streamUnavailableHandler) {
            this.streamUnavailableHandler(event.endpointId);
        }
    };
    BandwidthRtc.prototype.stopLocalMedia = function (streamId) {
        var _a;
        if (streamId) {
            // If a stream ID was passed in, just stop that particular one
            (_a = this.localStreams
                .get(streamId)) === null || _a === void 0 ? void 0 : _a.getTracks().forEach(function (track) { return track.stop(); });
        }
        else {
            // Otherwise stop all tracks from all streams
            this.localStreams.forEach(function (stream) {
                stream.getTracks().forEach(function (track) { return track.stop(); });
            });
        }
    };
    BandwidthRtc.prototype.handleSdpNeededEvent = function (sdpRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var endpointId, peerConnection;
            return __generator(this, function (_a) {
                endpointId = sdpRequest.endpointId;
                peerConnection = this.remotePeerConnections.get(endpointId) || this.localPeerConnections.get(endpointId);
                // TODO: are we safe not to perform a check in this case?
                if (!peerConnection) {
                    peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
                    this.setupNewPeerConnection(peerConnection, endpointId, sdpRequest.mediaTypes);
                    this.remotePeerConnections.set(endpointId, peerConnection);
                }
                return [2 /*return*/, this.negotiateSdp(sdpRequest, peerConnection)];
            });
        });
    };
    BandwidthRtc.prototype.negotiateSdp = function (sdpRequest, peerConnection) {
        return __awaiter(this, void 0, void 0, function () {
            var endpointId, direction, offerOptions, offer, sdpResponse, queuedIceCandidates, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endpointId = sdpRequest.endpointId;
                        direction = sdpRequest.direction;
                        offerOptions = {
                            offerToReceiveAudio: false,
                            offerToReceiveVideo: false,
                        };
                        if (direction.includes("recv")) {
                            offerOptions.offerToReceiveAudio = sdpRequest.mediaTypes.includes(types_1.MediaType.AUDIO);
                            offerOptions.offerToReceiveVideo = sdpRequest.mediaTypes.includes(types_1.MediaType.VIDEO);
                        }
                        return [4 /*yield*/, peerConnection.createOffer(offerOptions)];
                    case 1:
                        offer = _a.sent();
                        if (!offer.sdp) {
                            throw new Error("Created offer with no SDP");
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, this.signaling.offerSdp(offer.sdp, endpointId)];
                    case 3:
                        sdpResponse = _a.sent();
                        return [4 /*yield*/, peerConnection.setLocalDescription(offer)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, peerConnection.setRemoteDescription({
                                type: "answer",
                                sdp: sdpResponse.sdpAnswer,
                            })];
                    case 5:
                        _a.sent();
                        if (sdpResponse.candidates) {
                            sdpResponse.candidates.forEach(function (candidate) {
                                peerConnection.addIceCandidate(candidate);
                            });
                        }
                        queuedIceCandidates = this.iceCandidateQueues.get(endpointId);
                        if (queuedIceCandidates) {
                            queuedIceCandidates.forEach(function (candidate) {
                                peerConnection.addIceCandidate(candidate);
                            });
                            this.iceCandidateQueues.delete(endpointId);
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        e_2 = _a.sent();
                        if (String(e_2.message).toLowerCase().includes("sdp")) {
                            throw new types_1.SdpOfferRejectedError(e_2.message);
                        }
                        else {
                            throw e_2;
                        }
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    BandwidthRtc.prototype.setupNewPeerConnection = function (peerConnection, endpointId, mediaTypes) {
        var _this = this;
        peerConnection.onconnectionstatechange = function (event) {
            var peerConnection = event.target;
            var connectionState = peerConnection.connectionState;
            if (connectionState === "disconnected" || connectionState === "failed") {
                if (_this.streamUnavailableHandler) {
                    _this.streamUnavailableHandler(endpointId);
                }
                if (connectionState === "failed") {
                    _this.cleanupRemoteStreams(endpointId);
                }
            }
        };
        peerConnection.oniceconnectionstatechange = function (event) { };
        peerConnection.onicegatheringstatechange = function (event) { };
        peerConnection.onnegotiationneeded = function (event) { };
        peerConnection.onsignalingstatechange = function (event) { };
        peerConnection.onicecandidate = function (event) { return _this.signaling.sendIceCandidate(endpointId, event.candidate); };
        peerConnection.ontrack = function (event) {
            var streams = event.streams;
            var track = event.track;
            var transceiver = event.transceiver;
            var receiver = event.receiver;
            if (_this.streamAvailableHandler) {
                _this.streamAvailableHandler({
                    endpointId: endpointId,
                    mediaStream: event.streams[0],
                    mediaTypes: mediaTypes,
                });
            }
            track.onmute = function (event) { };
            track.onunmute = function (event) { };
            track.onended = function (event) { };
        };
    };
    BandwidthRtc.prototype.cleanupLocalStreams = function () {
        var e_3, _a;
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i] = arguments[_i];
        }
        if (streams.length === 0) {
            streams = Array.from(this.localStreams.keys());
        }
        try {
            for (var streams_2 = __values(streams), streams_2_1 = streams_2.next(); !streams_2_1.done; streams_2_1 = streams_2.next()) {
                var s = streams_2_1.value;
                this.stopLocalMedia(s);
                this.localStreams.delete(s);
                var localPeerConnection = this.localPeerConnections.get(s);
                localPeerConnection === null || localPeerConnection === void 0 ? void 0 : localPeerConnection.close();
                this.localPeerConnections.delete(s);
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (streams_2_1 && !streams_2_1.done && (_a = streams_2.return)) _a.call(streams_2);
            }
            finally { if (e_3) throw e_3.error; }
        }
    };
    BandwidthRtc.prototype.cleanupRemoteStreams = function () {
        var e_4, _a;
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i] = arguments[_i];
        }
        if (streams.length === 0) {
            streams = Array.from(this.remotePeerConnections.keys());
        }
        try {
            for (var streams_3 = __values(streams), streams_3_1 = streams_3.next(); !streams_3_1.done; streams_3_1 = streams_3.next()) {
                var s = streams_3_1.value;
                var remotePeerConnection = this.remotePeerConnections.get(s);
                remotePeerConnection === null || remotePeerConnection === void 0 ? void 0 : remotePeerConnection.close();
                this.remotePeerConnections.delete(s);
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (streams_3_1 && !streams_3_1.done && (_a = streams_3.return)) _a.call(streams_3);
            }
            finally { if (e_4) throw e_4.error; }
        }
    };
    return BandwidthRtc;
}());
exports.default = BandwidthRtc;
//# sourceMappingURL=bandwidthRtc.js.map