import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const metricsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bridge-home-'));
process.env.HOME = metricsHome;
const metrics = require('../src/core/metrics') as typeof import('../src/core/metrics');
const metricsFile = path.join(metricsHome, '.gemini-agent-bridge', 'delegations.jsonl');

test('metrics writes records and computes stats', () => {
  metrics.logDelegation({
    sourceAgent: 'Codex',
    taskType: 'hook',
    command: 'rg "needle"',
    reason: 'test',
    success: true,
    duration_ms: 2000,
    originalChars: 400,
    summaryChars: 100,
  });

  const records = metrics.getDelegations();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.estimatedSavedTokens, 75);
  assert.equal(records[0]?.compressionRatio, 4);

  const stats = metrics.getStats();
  assert.equal(stats.totalDelegations, 1);
  assert.equal(stats.totalSavedTokens, 75);
  assert.equal(stats.agentBreakdown.Codex, 75);
  assert.equal(stats.avgCompression, 4);
  assert.equal(stats.avgDuration, 2000);
});

test('metrics skips invalid json lines', () => {
  fs.appendFileSync(metricsFile, 'not-json\n');

  assert.doesNotThrow(() => metrics.getDelegations());
});
