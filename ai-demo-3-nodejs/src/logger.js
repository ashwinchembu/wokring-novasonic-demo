"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Logger module using Winston
 */
const winston_1 = __importDefault(require("winston"));
const config_1 = __importDefault(require("./config"));
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
        return `${timestamp} - ${level}: ${message}\n${stack}`;
    }
    return `${timestamp} - ${level}: ${message}`;
}));
const logger = winston_1.default.createLogger({
    level: config_1.default.app.logLevel,
    format: logFormat,
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), logFormat),
        }),
    ],
});
// Add file transport in production
if (config_1.default.app.env === 'production') {
    logger.add(new winston_1.default.transports.File({
        filename: 'logs/error.log',
        level: 'error',
    }));
    logger.add(new winston_1.default.transports.File({
        filename: 'logs/combined.log',
    }));
}
exports.default = logger;
//# sourceMappingURL=logger.js.map