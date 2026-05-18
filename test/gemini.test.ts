import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG } from '../src/core/config';
import { runGemini } from '../src/core/gemini';

function executable(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bridge-test-'));
  const file = path.join(dir, 'fake-gemini');
  fs.writeFileSync(file, contents, { mode: 0o755 });
  return file;
}

test('runGemini returns trimmed stdout for successful processes', async () => {
  const command = executable('#!/bin/sh\ncat >/dev/null\nprintf " summary output \\n"\n');
  const result = await runGemini(
    {
      ...DEFAULT_CONFIG,
      gemini: {
        ...DEFAULT_CONFIG.gemini,
        command,
        timeout_ms: 1000,
      },
    },
    'summarize',
    'raw output',
  );

  assert.equal(result.success, true);
  assert.equal(result.summary, 'summary output');
  assert.equal(result.error, undefined);
});

test('runGemini returns stderr for failed processes', async () => {
  const command = executable('#!/bin/sh\ncat >/dev/null\nprintf "bad command" >&2\nexit 2\n');
  const result = await runGemini(
    {
      ...DEFAULT_CONFIG,
      gemini: {
        ...DEFAULT_CONFIG.gemini,
        command,
        timeout_ms: 1000,
      },
    },
    'summarize',
    'raw output',
  );

  assert.equal(result.success, false);
  assert.equal(result.summary, '');
  assert.equal(result.error, 'bad command');
});

