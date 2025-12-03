"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEndpointUrl = void 0;
/**
 * Configuration module
 * Loads and validates environment variables
 */
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const config = {
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    },
    bedrock: {
        modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-sonic-v1:0',
        endpointUrl: process.env.BEDROCK_ENDPOINT_URL,
    },
    app: {
        env: process.env.APP_ENV || 'development',
        port: parseInt(process.env.APP_PORT || '8000', 10),
        host: process.env.APP_HOST || '0.0.0.0',
        logLevel: process.env.LOG_LEVEL || 'info',
    },
    audio: {
        inputSampleRate: parseInt(process.env.INPUT_SAMPLE_RATE || '16000', 10),
        outputSampleRate: parseInt(process.env.OUTPUT_SAMPLE_RATE || '24000', 10),
        channels: parseInt(process.env.AUDIO_CHANNELS || '1', 10),
        bitDepth: parseInt(process.env.AUDIO_BIT_DEPTH || '16', 10),
    },
    session: {
        maxDuration: parseInt(process.env.MAX_SESSION_DURATION || '1800', 10),
        timeout: parseInt(process.env.SESSION_TIMEOUT || '300', 10),
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '100', 10),
    },
    novaSonic: {
        maxTokens: parseInt(process.env.MAX_TOKENS || '1024', 10),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
        topP: parseFloat(process.env.TOP_P || '0.9'),
        voiceId: process.env.VOICE_ID || 'matthew',
    },
    cors: {
        // In production without CORS_ORIGINS set, allow all origins for easier deployment
        // Set CORS_ORIGINS explicitly for production security
        origins: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
            : process.env.NODE_ENV === 'production'
                ? true  // Allow all origins in production if not specified
                : ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000'],
    },
    redshift: process.env.REDSHIFT_HOST
        ? {
            host: process.env.REDSHIFT_HOST,
            port: parseInt(process.env.REDSHIFT_PORT || '5439', 10),
            database: process.env.REDSHIFT_DB,
            user: process.env.REDSHIFT_USER,
            password: process.env.REDSHIFT_PASSWORD,
            useIam: process.env.REDSHIFT_USE_IAM === 'true',
            connectTimeout: parseInt(process.env.REDSHIFT_CONNECT_TIMEOUT || '10', 10),
            queryTimeout: parseInt(process.env.REDSHIFT_QUERY_TIMEOUT || '30', 10),
        }
        : undefined,
    n8n: process.env.N8N_WEBHOOK_URL
        ? {
            webhookUrl: process.env.N8N_WEBHOOK_URL,
            webhookSecret: process.env.N8N_WEBHOOK_SECRET,
        }
        : undefined,
    debug: process.env.DEBUG === 'true',
};
// Computed properties
const getEndpointUrl = () => {
    if (config.bedrock.endpointUrl) {
        return config.bedrock.endpointUrl;
    }
    return `https://bedrock-runtime.${config.aws.region}.amazonaws.com`;
};
exports.getEndpointUrl = getEndpointUrl;
exports.default = config;
//# sourceMappingURL=config.js.map