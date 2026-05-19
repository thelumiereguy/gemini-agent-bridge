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
      'atlassian': { min_chars: 2000 },
      'figma': { min_chars: 5000 },
      'mcp__': { min_chars: 5000 }
    }
  },
  exclude_paths: [
    '.env',
    '.env.*',
    '**/*.pem',
    '**/*.key',
    '**/.git/**',
  ],
  metrics: {
    enabled: true,
  },
};

export function loadConfig(): Config {
  let config = mergeConfig(DEFAULT_CONFIG, {});

  config = mergeConfig(config, loadFileConfig(GLOBAL_CONFIG_FILE));
  config = mergeConfig(config, loadFileConfig(PROJECT_CONFIG_FILE));

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
