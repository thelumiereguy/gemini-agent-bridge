import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_DIR = path.join(os.homedir(), '.gemini-agent-bridge');
const LOG_FILE = path.join(LOG_DIR, 'bridge.log');

let loggingAvailable = true;

try {
  // Create directory once at module load; mkdirSync with recursive is idempotent
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  loggingAvailable = false;
}

export function log(message: string) {
  if (!loggingAvailable) return;

  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
  } catch {
    loggingAvailable = false;
  }
}

export function getLogPath(): string {
  return LOG_FILE;
}
