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

test('runGemini forwards only the minimal Gemini child environment', async () => {
  const command = executable(`#!/bin/sh
cat >/dev/null
printf "project=%s\\n" "\${GOOGLE_CLOUD_PROJECT-unset}"
printf "project_id=%s\\n" "\${GOOGLE_CLOUD_PROJECT_ID-unset}"
printf "path=%s\\n" "\${PATH-unset}"
printf "secret_present=%s\\n" "\${GEMINI_BRIDGE_SECRET+x}"
`);

  const previousProject = process.env.GOOGLE_CLOUD_PROJECT;
  const previousProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const previousSecret = process.env.GEMINI_BRIDGE_SECRET;

  try {
    process.env.GOOGLE_CLOUD_PROJECT = 'primary-project';
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'fallback-project';
    process.env.GEMINI_BRIDGE_SECRET = 'do-not-forward';

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
    assert.equal(result.summary, [
      'project=primary-project',
      'project_id=fallback-project',
      'path=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      'secret_present=',
    ].join('\n'));
  } finally {
    if (previousProject === undefined) {
      delete process.env.GOOGLE_CLOUD_PROJECT;
    } else {
      process.env.GOOGLE_CLOUD_PROJECT = previousProject;
    }

    if (previousProjectId === undefined) {
      delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    } else {
      process.env.GOOGLE_CLOUD_PROJECT_ID = previousProjectId;
    }

    if (previousSecret === undefined) {
      delete process.env.GEMINI_BRIDGE_SECRET;
    } else {
      process.env.GEMINI_BRIDGE_SECRET = previousSecret;
    }
  }
});
