/**
 * Configuration module
 * Loads and validates environment variables
 */
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  // AWS Configuration
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region: string;
  };

  // Bedrock Configuration
  bedrock: {
    modelId: string;
    endpointUrl?: string;
  };

  // Application Configuration
  app: {
    env: string;
    port: number;
    host: string;
    logLevel: string;
  };

  // Audio Configuration
  audio: {
    inputSampleRate: number;
    outputSampleRate: number;
    channels: number;
    bitDepth: number;
  };

  // Session Configuration
  session: {
    maxDuration: number;
    timeout: number;
    maxConcurrent: number;
  };

  // Nova Sonic Configuration
  novaSonic: {
    maxTokens: number;
    temperature: number;
    topP: number;
    voiceId: string;
  };

  // CORS Configuration
  cors: {
    origins: string[];
  };

  // Redshift Configuration (optional)
  redshift?: {
    host?: string;
    port: number;
    database?: string;
    user?: string;
    password?: string;
    useIam: boolean;
    connectTimeout: number;
    queryTimeout: number;
  };

  // n8n Configuration (optional)
  n8n?: {
    webhookUrl?: string;
    webhookSecret?: string;
  };

  // Debug
  debug: boolean;
}

const config: Config = {
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
    origins: (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
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
export const getEndpointUrl = (): string => {
  if (config.bedrock.endpointUrl) {
    return config.bedrock.endpointUrl;
  }
  return `https://bedrock-runtime.${config.aws.region}.amazonaws.com`;
};

export default config;

