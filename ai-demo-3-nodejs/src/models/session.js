"use strict";
/**
 * Session models and TypeScript types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Speaker = exports.AudioFormat = exports.SessionStatus = void 0;
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["CREATED"] = "created";
    SessionStatus["ACTIVE"] = "active";
    SessionStatus["ENDED"] = "ended";
    SessionStatus["ERROR"] = "error";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
var AudioFormat;
(function (AudioFormat) {
    AudioFormat["PCM"] = "pcm";
    AudioFormat["WAV"] = "wav";
    AudioFormat["MP3"] = "mp3";
})(AudioFormat || (exports.AudioFormat = AudioFormat = {}));
var Speaker;
(function (Speaker) {
    Speaker["USER"] = "user";
    Speaker["ASSISTANT"] = "assistant";
    Speaker["SYSTEM"] = "system";
})(Speaker || (exports.Speaker = Speaker = {}));
//# sourceMappingURL=session.js.map