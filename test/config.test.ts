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

test('loads nested config from GEMINI_BRIDGE_CONFIG', () => {
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
      const config = loadConfig();

      assert.equal(config.enabled, false);
      assert.equal(config.gemini.command, 'gemini-test');
      assert.equal(config.gemini.timeout_ms, 1234);
      assert.deepEqual(config.gemini.env, { FOO: 'bar' });
      assert.equal(config.delegate.min_files, 9);
      assert.equal(config.delegate.tool_overrides?.CustomTool?.min_chars, 42);
      assert.equal(config.metrics.enabled, false);
    },
  );
});

test('GEMINI_BRIDGE_MIN_CHARS overrides parsed numeric values only', () => {
  withEnv({ GEMINI_BRIDGE_MIN_CHARS: '123' }, () => {
    assert.equal(loadConfig().delegate.min_chars, 123);
  });

  withEnv({ GEMINI_BRIDGE_MIN_CHARS: 'not-a-number' }, () => {
    assert.equal(loadConfig().delegate.min_chars, 25_000);
  });
});

test('GEMINI_BRIDGE_TOOL_OVERRIDES merges with defaults', () => {
  withEnv(
    {
      GEMINI_BRIDGE_TOOL_OVERRIDES: JSON.stringify({
        Grep: { min_chars: 99, min_files: 1 },
        NewTool: { min_chars: 1000 },
      }),
    },
    () => {
      const overrides = loadConfig().delegate.tool_overrides;

      assert.equal(overrides?.Grep?.min_chars, 99);
      assert.equal(overrides?.Grep?.min_files, 1);
      assert.equal(overrides?.NewTool?.min_chars, 1000);
      assert.equal(overrides?.Glob?.min_chars, 5000);
    },
  );
});

