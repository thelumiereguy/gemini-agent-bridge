import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/core/config';

const envKeys = [
  'GEMINI_BRIDGE_CONFIG',
  'GEMINI_BRIDGE_MIN_CHARS',
  'GEMINI_BRIDGE_TOOL_OVERRIDES',
] as const;

function withEnv(values: Partial<Record<(typeof envKeys)[number], string>>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of envKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    Object.assign(process.env, values);
    fn();
  } finally {
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('GEMINI_BRIDGE_CONFIG is ignored', () => {
  let baseline = loadConfig();
  withEnv({}, () => {
    baseline = loadConfig();
  });

  withEnv(
    {
      GEMINI_BRIDGE_CONFIG: JSON.stringify({
        enabled: false,
        gemini: {
          command: 'gemini-test',
          timeout_ms: 1234,
          env: {
            FOO: 'bar',
          },
        },
        delegate: {
          min_files: 9,
          tool_overrides: {
            CustomTool: {
              min_chars: 42,
            },
          },
        },
        metrics: {
          enabled: false,
        },
      }),
    },
    () => {
      assert.deepEqual(loadConfig(), baseline);
    },
  );
});

test('GEMINI_BRIDGE_MIN_CHARS is ignored', () => {
  let baseline = loadConfig();
  withEnv({}, () => {
    baseline = loadConfig();
  });

  withEnv({ GEMINI_BRIDGE_MIN_CHARS: '123' }, () => {
    assert.deepEqual(loadConfig(), baseline);
  });
});

test('GEMINI_BRIDGE_TOOL_OVERRIDES is ignored', () => {
  let baseline = loadConfig();
  withEnv({}, () => {
    baseline = loadConfig();
  });

  withEnv(
    {
      GEMINI_BRIDGE_TOOL_OVERRIDES: JSON.stringify({
        Grep: { min_chars: 99, min_files: 1 },
        NewTool: { min_chars: 1000 },
      }),
    },
    () => {
      assert.deepEqual(loadConfig(), baseline);
    },
  );
});
