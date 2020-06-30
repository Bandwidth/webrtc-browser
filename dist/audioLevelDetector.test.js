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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var types_1 = require("./types");
var audioLevelDetector_1 = __importDefault(require("./audioLevelDetector"));
var time_1 = require("./time");
var MockAudioContext = /** @class */ (function () {
    function MockAudioContext() {
    }
    MockAudioContext.prototype.createMediaStreamSource = function () {
        return { connect: function () { } };
    };
    MockAudioContext.prototype.createAnalyser = function () {
        return {};
    };
    return MockAudioContext;
}());
var realInterval = setInterval;
//@ts-ignore
var realAudioContext = global.AudioContext;
var mockInterval = setInterval(function () { }, 0);
// Un-normalized sample values are centered on 128, so 128 is silent
var SILENT_SAMPLE_VALUE = 128;
// 154 is "20.03% louder" than "silent" so it should be just above the noise suppression threshold
var LOW_SAMPLE_VALUE = 154;
// 256 is the maximum amplitude that can be measured by the Web Audio API
var HIGH_SAMPLE_VALUE = 256;
beforeAll(function () {
    //@ts-ignore
    global.AudioContext = MockAudioContext;
    global.setInterval = function (callback, ms) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        return mockInterval;
    };
});
afterAll(function () {
    //@ts-ignore
    global.AudioContext = realAudioContext;
    global.setInterval = realInterval;
});
test("test emit silent at start", function () {
    var spy = jest.fn();
    var timeThreshold = 10;
    var audioLevelDetector = new audioLevelDetector_1.default({
        mediaStream: {},
        timeThreshold: timeThreshold,
    });
    audioLevelDetector.on("audioLevelChange", spy);
    audioLevelDetector.emitCurrentAudioLevel();
    expect(spy).toHaveBeenCalledWith(types_1.AudioLevel.SILENT);
});
test("test emit low", function () {
    var spy = jest.fn();
    var timeThreshold = 10;
    var audioLevelDetector = new audioLevelDetector_1.default({
        mediaStream: {},
        timeThreshold: timeThreshold,
    });
    audioLevelDetector.on("audioLevelChange", spy);
    audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(LOW_SAMPLE_VALUE));
    audioLevelDetector.emitCurrentAudioLevel();
    expect(spy).toHaveBeenCalledWith(types_1.AudioLevel.LOW);
});
test("test emit high", function () {
    var spy = jest.fn();
    var timeThreshold = 10;
    var audioLevelDetector = new audioLevelDetector_1.default({
        mediaStream: {},
        timeThreshold: timeThreshold,
    });
    audioLevelDetector.on("audioLevelChange", spy);
    audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(HIGH_SAMPLE_VALUE));
    audioLevelDetector.emitCurrentAudioLevel();
    expect(spy).toHaveBeenCalledWith(types_1.AudioLevel.HIGH);
});
test("test immediate transition from low to high", function () {
    var spy = jest.fn();
    var timeThreshold = 10;
    var audioLevelDetector = new audioLevelDetector_1.default({
        mediaStream: {},
        timeThreshold: timeThreshold,
    });
    audioLevelDetector.on("audioLevelChange", spy);
    audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(LOW_SAMPLE_VALUE));
    audioLevelDetector.emitCurrentAudioLevel();
    expect(spy).toHaveBeenCalledWith(types_1.AudioLevel.LOW);
    audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(HIGH_SAMPLE_VALUE));
    audioLevelDetector.emitCurrentAudioLevel();
    expect(spy).toHaveBeenCalledWith(types_1.AudioLevel.HIGH);
});
test("test emit silent after time threshold", function (done) { return __awaiter(void 0, void 0, void 0, function () {
    var spy, timeThreshold, audioLevelDetector;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                spy = jest.fn();
                timeThreshold = 10;
                audioLevelDetector = new audioLevelDetector_1.default({
                    mediaStream: {},
                    timeThreshold: timeThreshold,
                });
                audioLevelDetector.on("audioLevelChange", spy);
                audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(LOW_SAMPLE_VALUE));
                audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(HIGH_SAMPLE_VALUE));
                return [4 /*yield*/, time_1.sleep(timeThreshold + 5)];
            case 1:
                _a.sent();
                audioLevelDetector.analyseSample(audioLevelDetector.normalizeSample(SILENT_SAMPLE_VALUE));
                audioLevelDetector.emitCurrentAudioLevel();
                expect(spy).toHaveBeenLastCalledWith(types_1.AudioLevel.SILENT);
                done();
                return [2 /*return*/];
        }
    });
}); });
//# sourceMappingURL=audioLevelDetector.test.js.map