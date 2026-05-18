import { Config } from '../core/config';
import { shouldDelegate } from '../core/delegation';
import { runGemini } from '../core/gemini';
import { redact } from '../core/redaction';
import { logDelegation } from '../core/metrics';
import { log } from '../core/logger';

export interface CodexHookInput {
  command: string;
  output: string;
  prompt?: string;
  fileCount?: number;
}

export interface CodexHookResult {
  output: string;
  delegated: boolean;
}

export async function handleCodexHook(config: Config, input: CodexHookInput): Promise<CodexHookResult> {
  const delegation = shouldDelegate(config, {
    command: input.command,
    output: input.output,
    fileCount: input.fileCount,
  });

  if (!delegation.should) {
    log(`Delegation skipped: ${delegation.reason}`);
    return { output: input.output, delegated: false };
  }

  log(`Delegating to Gemini...`);

  const redactedOutput = redact(input.output);
  const geminiResult = await runGemini(
    config,
    input.prompt || `Analyze the output of the command: ${input.command}`,
    redactedOutput
  );

  if (config.metrics.enabled) {
    logDelegation({
      sourceAgent: 'Codex',
      taskType: 'hook',
      command: input.command,
      reason: delegation.should ? 'Large output/Broad search' : (delegation.reason || 'Unknown'),
      success: geminiResult.success,
      duration_ms: geminiResult.duration_ms,
      originalChars: input.output.length,
      summaryChars: geminiResult.summary.length,
    });
  }

  if (geminiResult.success) {
    if (geminiResult.summary.length > input.output.length) {
      log(`[Codex] Summary (${geminiResult.summary.length}) is larger than original (${input.output.length}). Falling back to original.`);
      return { output: input.output, delegated: false };
    }
    return { output: geminiResult.summary, delegated: true };
  } else {
    log(`Gemini delegation failed: ${geminiResult.error}`);
    return { output: input.output, delegated: false };
  }
}
