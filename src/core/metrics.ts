import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { log } from './logger';

export interface DelegationRecord {
  timestamp: string;
  sourceAgent: string;
  taskType: string;
  command: string;
  reason: string;
  success: boolean;
  duration_ms: number;
  originalChars: number;
  summaryChars: number;
  estimatedSavedTokens: number;
  compressionRatio: number;
}

const METRICS_DIR = path.join(os.homedir(), '.gemini-agent-bridge');
const METRICS_FILE = path.join(METRICS_DIR, 'delegations.jsonl');

// Create directory once at module load; mkdirSync with recursive is idempotent
fs.mkdirSync(METRICS_DIR, { recursive: true });

export function logDelegation(record: Omit<DelegationRecord, 'timestamp' | 'estimatedSavedTokens' | 'compressionRatio'>) {
  const timestamp = new Date().toISOString();
  const originalTokens = Math.round(record.originalChars / 4);
  const summaryTokens = Math.round(record.summaryChars / 4);
  const estimatedSavedTokens = Math.max(0, originalTokens - summaryTokens);
  const compressionRatio = record.summaryChars > 0 ? record.originalChars / record.summaryChars : 0;

  const fullRecord: DelegationRecord = {
    ...record,
    timestamp,
    estimatedSavedTokens,
    compressionRatio: Number(compressionRatio.toFixed(2)),
  };

  fs.appendFileSync(METRICS_FILE, JSON.stringify(fullRecord) + '\n');
}

export function getDelegations(): DelegationRecord[] {
  if (!fs.existsSync(METRICS_FILE)) {
    return [];
  }

  const lines = fs.readFileSync(METRICS_FILE, 'utf-8').trim().split('\n');
  const records: DelegationRecord[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      log(`Error parsing metrics line: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return records;
}

export function getStats() {
  const delegations = getDelegations();
  const today = new Date().toISOString().split('T')[0]!;
  const todayDelegations = delegations.filter(d => d.timestamp.startsWith(today));

  const totalSavedTokens = delegations.reduce((acc, d) => acc + d.estimatedSavedTokens, 0);

  const agentBreakdown: Record<string, number> = {};
  delegations.forEach(d => {
    const agent = d.sourceAgent || 'Unknown';
    agentBreakdown[agent] = (agentBreakdown[agent] || 0) + d.estimatedSavedTokens;
  });

  const avgCompression = delegations.length > 0
    ? delegations.reduce((acc, d) => acc + d.compressionRatio, 0) / delegations.length
    : 0;
  const avgDuration = delegations.length > 0
    ? delegations.reduce((acc, d) => acc + d.duration_ms, 0) / delegations.length
    : 0;

  return {
    totalDelegations: delegations.length,
    todayDelegations: todayDelegations.length,
    totalSavedTokens,
    agentBreakdown,
    avgCompression,
    avgDuration,
  };
}
