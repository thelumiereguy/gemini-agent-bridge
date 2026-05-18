import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { log } from './logger';

const GLOBAL_CONFIG_FILE = path.join(os.homedir(), '.gemini-agent-bridge', 'config.json');
const PROJECT_CONFIG_FILE = path.join(process.cwd(), '.gemini-agent-bridge.json');

function loadFileConfig(filePath: string): any {
  if (!fs.existsSync(filePath)) return {};
  try {
    log(`Loading config from ${filePath}`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    log(`Error reading config file ${filePath}: ${error}`);
    return {};
  }
}

export interface ToolOverride {
  min_chars?: number;
  min_files?: number;
}

export interface Config {
  enabled: boolean;
  gemini: {
    command: string;
    timeout_ms: number;
    env?: Record<string, string>;
  };
  delegate: {
    min_chars: number;
    min_files: number;
    max_chars: number;
    tool_overrides?: Record<string, ToolOverride>;
  };
  exclude_paths: string[];
  metrics: {
    enabled: boolean;
  };
}

export const DEFAULT_CONFIG: Config = {
  enabled: true,
  gemini: {
    command: 'gemini',
    timeout_ms: 90000,
    env: {},
  },
  delegate: {
    min_chars: 25000,
    min_files: 4,
    max_chars: 1500000,
    tool_overrides: {
      'Grep': { min_chars: 5000, min_files: 2 },
      'Glob': { min_chars: 5000, min_files: 2 },
      'LS': { min_chars: 5000, min_files: 2 },
      'mcp__': { min_chars: 5000 }
    }
  },
  exclude_paths: [
    '.env',
    '.env.*',
    '**/*.pem',
    '**/*.key',
    '**/.git/**',
    '**/node_modules/**',
    '**/build/**',
    '**/dist/**',
  ],
  metrics: {
    enabled: true,
  },
};

export function loadConfig(): Config {
  let config = mergeConfig(DEFAULT_CONFIG, {});

  config = mergeConfig(config, loadFileConfig(GLOBAL_CONFIG_FILE));
  config = mergeConfig(config, loadFileConfig(PROJECT_CONFIG_FILE));

  if (process.env.GEMINI_BRIDGE_CONFIG) {
    try {
      log('Loading GEMINI_BRIDGE_CONFIG from env');
      const envConfig = JSON.parse(process.env.GEMINI_BRIDGE_CONFIG);
      config = mergeConfig(config, envConfig);
    } catch (error) {
      log(`Error parsing GEMINI_BRIDGE_CONFIG: ${error}`);
    }
  }

  if (process.env.GEMINI_BRIDGE_MIN_CHARS) {
    const parsed = parseInt(process.env.GEMINI_BRIDGE_MIN_CHARS, 10);
    if (!isNaN(parsed)) {
      log(`Overriding min_chars from env: ${parsed}`);
      config.delegate.min_chars = parsed;
    } else {
      log(`Invalid GEMINI_BRIDGE_MIN_CHARS value: ${process.env.GEMINI_BRIDGE_MIN_CHARS}`);
    }
  }

  if (process.env.GEMINI_BRIDGE_TOOL_OVERRIDES) {
    try {
      log('Loading GEMINI_BRIDGE_TOOL_OVERRIDES from env');
      const overrides = JSON.parse(process.env.GEMINI_BRIDGE_TOOL_OVERRIDES);
      config.delegate.tool_overrides = {
        ...config.delegate.tool_overrides,
        ...overrides
      };
      log(`Active overrides: ${Object.keys(config.delegate.tool_overrides || {}).join(', ')}`);
    } catch (error) {
      log(`Error parsing GEMINI_BRIDGE_TOOL_OVERRIDES: ${error}`);
    }
  }

  return config;
}

function mergeConfig(base: Config, update: any): Config {
  return {
    ...base,
    ...update,
    gemini: {
      ...base.gemini,
      ...(update.gemini || {})
    },
    delegate: {
      ...base.delegate,
      ...(update.delegate || {}),
      tool_overrides: {
        ...base.delegate.tool_overrides,
        ...(update.delegate?.tool_overrides || {})
      }
    },
    metrics: {
      ...base.metrics,
      ...(update.metrics || {})
    },
  };
}
