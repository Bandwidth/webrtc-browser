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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SdpOfferRejectedError = exports.MediaType = exports.MediaAggregationType = exports.AudioLevel = void 0;
var AudioLevel;
(function (AudioLevel) {
    AudioLevel["SILENT"] = "silent";
    AudioLevel["LOW"] = "low";
    AudioLevel["HIGH"] = "high";
})(AudioLevel = exports.AudioLevel || (exports.AudioLevel = {}));
var MediaAggregationType;
(function (MediaAggregationType) {
    MediaAggregationType["NONE"] = "NONE";
    MediaAggregationType["COMPOSITE"] = "COMPOSITE";
})(MediaAggregationType = exports.MediaAggregationType || (exports.MediaAggregationType = {}));
var MediaType;
(function (MediaType) {
    MediaType["AUDIO"] = "AUDIO";
    MediaType["VIDEO"] = "VIDEO";
})(MediaType = exports.MediaType || (exports.MediaType = {}));
var SdpOfferRejectedError = /** @class */ (function (_super) {
    __extends(SdpOfferRejectedError, _super);
    function SdpOfferRejectedError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SdpOfferRejectedError;
}(Error));
exports.SdpOfferRejectedError = SdpOfferRejectedError;
//# sourceMappingURL=types.js.map