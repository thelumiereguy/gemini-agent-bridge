import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, Config } from '../src/core/config';
import { shouldDelegate } from '../src/core/delegation';

function configWith(update: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    ...update,
    gemini: {
      ...DEFAULT_CONFIG.gemini,
      ...(update.gemini || {}),
    },
    delegate: {
      ...DEFAULT_CONFIG.delegate,
      ...(update.delegate || {}),
      tool_overrides: {
        ...DEFAULT_CONFIG.delegate.tool_overrides,
        ...(update.delegate?.tool_overrides || {}),
      },
    },
    metrics: {
      ...DEFAULT_CONFIG.metrics,
      ...(update.metrics || {}),
    },
  };
}

test('does not delegate when bridge is disabled', () => {
  const result = shouldDelegate(configWith({ enabled: false }), {
    command: 'rg "needle"',
    output: 'x'.repeat(100_000),
  });

  assert.equal(result.should, false);
  assert.equal(result.reason, 'Bridge is disabled');
});

test('does not delegate mutating commands even with large output', () => {
  const result = shouldDelegate(configWith(), {
    command: 'rm -rf build',
    output: 'x'.repeat(100_000),
  });

  assert.equal(result.should, false);
  assert.equal(result.reason, 'Command appears to be mutating or destructive');
});

test('delegates when output meets the configured character threshold', () => {
  const result = shouldDelegate(configWith(), {
    command: 'npm test',
    output: 'x'.repeat(DEFAULT_CONFIG.delegate.min_chars),
  });

  assert.deepEqual(result, { should: true });
});

test('delegates when file count meets the configured threshold', () => {
  const result = shouldDelegate(configWith(), {
    command: 'rg "TODO"',
    output: 'short output',
    fileCount: DEFAULT_CONFIG.delegate.min_files,
  });

  assert.deepEqual(result, { should: true });
});

test('uses the most specific matching tool override', () => {
  const result = shouldDelegate(
    configWith({
      delegate: {
        ...DEFAULT_CONFIG.delegate,
        min_chars: 100_000,
        min_files: 10,
        tool_overrides: {
          'mcp__': { min_chars: 50_000 },
          'mcp__repo_search': { min_chars: 10 },
        },
      },
    }),
    {
      command: 'mcp__repo_search query',
      output: 'x'.repeat(10),
      fileCount: 0,
    },
  );

  assert.deepEqual(result, { should: true });
});

test('does not delegate excluded path commands', () => {
  const result = shouldDelegate(configWith(), {
    command: 'cat node_modules/typescript/package.json',
    output: 'x'.repeat(100_000),
  });

  assert.equal(result.should, false);
  assert.equal(result.reason, 'Command targets an excluded path pattern');
});

test('does not delegate output over the hard maximum', () => {
  const result = shouldDelegate(
    configWith({
      delegate: {
        ...DEFAULT_CONFIG.delegate,
        max_chars: 5,
      },
    }),
    {
      command: 'rg "needle"',
      output: 'x'.repeat(6),
    },
  );

  assert.equal(result.should, false);
  assert.match(result.reason || '', /Output too large/);
});

test('delegates broad search commands with substantial output below default threshold', () => {
  const result = shouldDelegate(configWith(), {
    command: 'find . -type f',
    output: 'x'.repeat(5_000),
  });

  assert.equal(result.should, true);
  assert.equal(result.reason, 'Broad search with substantial output');
});

