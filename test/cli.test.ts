import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

function executable(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bridge-cli-test-'));
  const file = path.join(dir, 'fake-gemini');
  fs.writeFileSync(file, contents, { mode: 0o755 });
  return file;
}

test('claude-hook emits a warning when Gemini delegation fails', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bridge-project-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-bridge-home-'));
  const fakeGemini = executable('#!/bin/sh\ncat >/dev/null\nprintf "missing project" >&2\nexit 2\n');

  fs.writeFileSync(
    path.join(cwd, '.gemini-agent-bridge.json'),
    JSON.stringify({
      gemini: {
        command: fakeGemini,
        timeout_ms: 1000,
      },
      delegate: {
        min_chars: 10,
      },
      metrics: {
        enabled: false,
      },
    }),
  );

  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: {
      command: 'rg "needle"',
    },
    tool_response: {
      content: 'a'.repeat(100),
    },
  });

  const result = spawnSync(
    process.execPath,
    [path.resolve('dist/cli/index.js'), 'claude-hook'],
    {
      cwd,
      env: {
        ...process.env,
        HOME: home,
      },
      input,
      encoding: 'utf-8',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    systemMessage: '⚠️ Gemini Sidecar could not summarize this output. Original tool output was left unchanged.',
  });
});
