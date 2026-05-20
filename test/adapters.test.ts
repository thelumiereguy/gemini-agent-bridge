import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, Config } from '../src/core/config';

function configWith(update: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    ...update,
    delegate: {
      ...DEFAULT_CONFIG.delegate,
      min_chars: 10,
      min_files: 100,
      max_chars: 1_000_000,
      tool_overrides: {},
      ...(update.delegate || {}),
    },
    metrics: {
      enabled: false,
      ...(update.metrics || {}),
    },
  };
}

test('codex hook returns a delegated Gemini summary', async () => {
  const gemini = require('../src/core/gemini') as typeof import('../src/core/gemini');
  const originalRunGemini = gemini.runGemini;
  gemini.runGemini = async () => ({
    summary: 'compact summary',
    duration_ms: 5,
    success: true,
  });

  try {
    const { handleCodexHook } = require('../src/adapters/codex') as typeof import('../src/adapters/codex');
    const result = await handleCodexHook(configWith(), {
      command: 'rg "needle"',
      output: 'a'.repeat(100),
    });

    assert.deepEqual(result, {
      output: 'compact summary',
      delegated: true,
    });
  } finally {
    gemini.runGemini = originalRunGemini;
  }
});

test('codex hook falls back when summary is larger than original', async () => {
  const gemini = require('../src/core/gemini') as typeof import('../src/core/gemini');
  const originalRunGemini = gemini.runGemini;
  gemini.runGemini = async () => ({
    summary: 'this summary is much larger than the raw output',
    duration_ms: 5,
    success: true,
  });

  try {
    const { handleCodexHook } = require('../src/adapters/codex') as typeof import('../src/adapters/codex');
    const result = await handleCodexHook(configWith(), {
      command: 'rg "needle"',
      output: 'small raw output',
    });

    assert.deepEqual(result, {
      output: 'small raw output',
      delegated: false,
    });
  } finally {
    gemini.runGemini = originalRunGemini;
  }
});

test('claude hook returns original output when delegation is skipped', async () => {
  const { handleClaudeHook } = require('../src/adapters/claude') as typeof import('../src/adapters/claude');
  const result = await handleClaudeHook(configWith(), {
    command: 'rg "needle"',
    output: 'short',
  });

  assert.deepEqual(result, {
    output: 'short',
    delegated: false,
    failed: false,
  });
});

test('claude hook returns Gemini summary after redacting output', async () => {
  const gemini = require('../src/core/gemini') as typeof import('../src/core/gemini');
  const originalRunGemini = gemini.runGemini;
  let receivedInput = '';
  gemini.runGemini = async (_config, _prompt, input) => {
    receivedInput = input;
    return {
      summary: 'claude summary',
      duration_ms: 5,
      success: true,
    };
  };

  try {
    const { handleClaudeHook } = require('../src/adapters/claude') as typeof import('../src/adapters/claude');
    const result = await handleClaudeHook(configWith(), {
      command: 'rg "needle"',
      output: 'token=abcdefghijklmnopqrstuvwxyz\n' + 'a'.repeat(100),
    });

    assert.deepEqual(result, {
      output: 'claude summary',
      delegated: true,
      failed: false,
    });
    assert.match(receivedInput, /token=\[REDACTED\]/);
  } finally {
    gemini.runGemini = originalRunGemini;
  }
});

test('claude hook marks Gemini failures without changing output', async () => {
  const gemini = require('../src/core/gemini') as typeof import('../src/core/gemini');
  const originalRunGemini = gemini.runGemini;
  gemini.runGemini = async () => ({
    summary: '',
    duration_ms: 5,
    success: false,
    error: 'missing project',
  });

  try {
    const { handleClaudeHook } = require('../src/adapters/claude') as typeof import('../src/adapters/claude');
    const result = await handleClaudeHook(configWith(), {
      command: 'rg "needle"',
      output: 'a'.repeat(100),
    });

    assert.deepEqual(result, {
      output: 'a'.repeat(100),
      delegated: false,
      failed: true,
    });
  } finally {
    gemini.runGemini = originalRunGemini;
  }
});
