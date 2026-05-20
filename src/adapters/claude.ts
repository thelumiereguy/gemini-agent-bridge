import { Config } from '../core/config';
import { shouldDelegate } from '../core/delegation';
import { runGemini } from '../core/gemini';
import { redact } from '../core/redaction';
import { logDelegation } from '../core/metrics';
import { log } from '../core/logger';

export interface ClaudeHookInput {
  command: string;
  output: string;
  context?: string;
  fileCount?: number;
}

export interface ClaudeHookResult {
  output: string;
  delegated: boolean;
  failed: boolean;
}

export async function handleClaudeHook(config: Config, input: ClaudeHookInput): Promise<ClaudeHookResult> {
  const delegation = shouldDelegate(config, {
    command: input.command,
    output: input.output,
    fileCount: input.fileCount
  });

  if (!delegation.should) {
    return { output: input.output, delegated: false, failed: false };
  }

  const redactedOutput = redact(input.output);
  const geminiResult = await runGemini(
    config, 
    input.context || `Analyze the output of the command: ${input.command}`, 
    redactedOutput
  );

  if (config.metrics.enabled) {
    logDelegation({
      sourceAgent: 'Claude',
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
      log(`[Claude] Summary (${geminiResult.summary.length}) is larger than original (${input.output.length}). Falling back to original.`);
      return { output: input.output, delegated: false, failed: false };
    }
    return { output: geminiResult.summary, delegated: true, failed: false };
  } else {
    log(`[Claude] Gemini delegation failed: ${geminiResult.error}`);
    return { output: input.output, delegated: false, failed: true };
  }
}
