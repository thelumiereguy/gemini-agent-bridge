#!/usr/bin/env node
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { loadConfig, Config } from '../core/config';
import { handleCodexHook } from '../adapters/codex';
import { handleClaudeHook } from '../adapters/claude';
import { getStats, getDelegations } from '../core/metrics';
import { log, getLogPath } from '../core/logger';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const config = loadConfig();

  switch (command) {
    case 'codex-hook':
      await codexHook(config);
      break;
    case 'claude-hook':
      await claudeHook(config);
      break;
    case 'doctor':
      doctor(config);
      break;
    case 'stats':
      showStats();
      break;
    case 'delegations':
      showDelegations();
      break;
    case 'logs':
      console.log(`Tail logs with: tail -f ${getLogPath()}`);
      break;
    default:
      console.log(`
Gemini Agent Bridge

Usage:
  gemini-agent-bridge codex-hook
  gemini-agent-bridge claude-hook
  gemini-agent-bridge doctor
  gemini-agent-bridge stats
  gemini-agent-bridge delegations
  gemini-agent-bridge logs
`);
      process.exit(1)
  }
}

async function claudeHook(config: Config) {
  const input = await readStdin();
  try {
    log(`Claude input received: bytes=${Buffer.byteLength(input, 'utf-8')}`);
    const data = JSON.parse(input);

    // Official Claude PostToolUse protocol:
    // Input tool output is in data.tool_response
    // Structure: { content: string, is_error: boolean }
    const toolName = data.tool_name || 'unknown';
    const toolResponse = data.tool_response;

    let output = '';
    if (toolResponse && typeof toolResponse.content === 'string') {
      output = toolResponse.content;
    } else if (typeof toolResponse === 'string') {
      output = toolResponse;
    } else if (toolResponse && typeof toolResponse === 'object') {
      output = toolResponse.stdout || toolResponse.output || JSON.stringify(toolResponse);
    } else {
      log(`Could not find output in tool_response for ${toolName}. Keys: ${Object.keys(data).join(', ')}`);
      process.stdout.write(JSON.stringify({}) + '\n');
      return;
    }

    const command = data.tool_input?.command || data.tool_input?.path || data.command || `${toolName}(...)`;
    log(`Normalized Claude: tool="${toolName}", outputLength=${output.length}`);

    let fileCount = 0;
    if (toolName === 'Grep' || toolName === 'Glob' || toolName === 'LS') {
      const lines = output.split('\n');
      const uniqueFiles = new Set(lines.map((l: string) => l.split(':')[0].trim()).filter((l: string) => l.length > 0));
      fileCount = uniqueFiles.size;
    }

    const result = await handleClaudeHook(config, { ...data, command, output, fileCount });

    if (result.delegated) {
      log(`Delegation successful for ${toolName}. Returning replacement output.`);

      let updatedToolOutput: any;
      if (toolResponse && typeof toolResponse.content === 'string') {
        updatedToolOutput = { ...toolResponse, content: result.output };
      } else if (typeof toolResponse === 'object' && toolResponse !== null && 'stdout' in toolResponse) {
        updatedToolOutput = { ...toolResponse, stdout: result.output };
      } else if (typeof toolResponse === 'object' && toolResponse !== null && 'output' in toolResponse) {
        updatedToolOutput = { ...toolResponse, output: result.output };
      } else {
        updatedToolOutput = result.output;
      }

      const response = {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          updatedToolOutput: updatedToolOutput
        },
        systemMessage: "✨ Large output summarized by Gemini Sidecar."
      };

      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (result.failed) {
      const response = {
        systemMessage: "⚠️ Gemini Sidecar could not summarize this output. Original tool output was left unchanged."
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      process.stdout.write(JSON.stringify({}) + '\n');
    }
  } catch (error: any) {
    log(`Error in claude-hook: ${error.message}`);
    process.stdout.write(JSON.stringify({}) + '\n');
  }
}

async function codexHook(config: Config) {
  const input = await readStdin();
  try {
    log(`Codex input received: bytes=${Buffer.byteLength(input, 'utf-8')}`);
    const data = JSON.parse(input);
    log(`Parsed keys: ${Object.keys(data).join(', ')}`);

    const command = data.tool_input?.command || data.command || data.tool_use?.command || 'unknown';

    let output = '';
    const rawResponse = data.tool_response || data.output || data.tool_result || '';
    if (typeof rawResponse === 'string') {
      output = rawResponse;
    } else if (typeof rawResponse === 'object' && rawResponse !== null) {
      output = rawResponse.stdout || rawResponse.output || JSON.stringify(rawResponse);
    }

    log(`Normalized: command="${command}", outputLength=${output.length}`);
    const result = await handleCodexHook(config, { ...data, command, output });

    if (result.delegated) {
      const response = {
        decision: "block",
        reason: "✨ Large output summarized by Gemini Sidecar.",
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: result.output
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      process.stdout.write(JSON.stringify({}) + '\n');
    }
  } catch (error: any) {
    log(`Error in codex-hook: ${error.message}`);
    process.stdout.write(JSON.stringify({}) + '\n');
  }
}

function doctor(config: Config) {
  console.log('Gemini Agent Bridge - Doctor');
  console.log('----------------------------');
  console.log(`Config enabled: ${config.enabled}`);
  console.log(`Gemini command: ${config.gemini.command}`);

  try {
    const result = spawnSync(config.gemini.command, ['--version']);
    if (result.status === 0) {
      console.log(`Gemini CLI version: ${result.stdout.toString().trim()} [OK]`);
    } else {
      console.log(`Gemini CLI: Found but returned error ${result.status} [FAILED]`);
    }
  } catch (e) {
    console.log(`Gemini CLI: Not found or error [FAILED]`);
  }

  console.log(`Min chars: ${config.delegate.min_chars}`);
  console.log(`Max chars: ${config.delegate.max_chars}`);
  console.log(`Min files: ${config.delegate.min_files}`);
}

function showStats() {
  const stats = getStats();
  console.log('Gemini Agent Bridge - Stats');
  console.log('---------------------------');
  console.log(`Total delegations: ${stats.totalDelegations}`);
  console.log(`Delegations today: ${stats.todayDelegations}`);
  console.log(`Total tokens saved: ${Math.round(stats.totalSavedTokens / 1000)}k`);

  Object.entries(stats.agentBreakdown).forEach(([agent, saved]) => {
    console.log(`  - ${agent}: ${Math.round(saved / 1000)}k saved`);
  });

  console.log(`Average compression ratio: ${stats.avgCompression.toFixed(1)}x`);
  console.log(`Average Gemini duration: ${(stats.avgDuration / 1000).toFixed(1)}s`);
}

function showDelegations() {
  const delegations = getDelegations();
  console.log('Gemini Agent Bridge - Recent Delegations');
  console.log('----------------------------------------');
  delegations.slice(-10).reverse().forEach(d => {
    const time = new Date(d.timestamp).toLocaleTimeString();
    const cmd = d.command.substring(0, 30);
    const ellipsis = d.command.length > 30 ? '...' : '';
    console.log(`${time} ${cmd}${ellipsis}`);
    console.log(`  Original: ~${Math.round(d.originalChars / 4)} tokens`);
    console.log(`  Returned: ~${Math.round(d.summaryChars / 4)} tokens`);
    console.log(`  Saved: ~${d.estimatedSavedTokens} tokens`);
    console.log(`  Compression: ${d.compressionRatio}x`);
    console.log(`  Gemini: ${d.success ? 'success' : 'failed'}`);
    console.log('');
  });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (chunk: Buffer) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught Exception: ${err.stack || err.message}`);
  process.exit(1);
});

main().catch(error => {
  log(`Fatal error: ${error.stack || error.message}`);
  process.exit(1);
});
