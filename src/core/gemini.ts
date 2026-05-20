import { spawn } from 'child_process';
import { Config } from './config';
import { log } from './logger';

export interface GeminiResult {
  summary: string;
  duration_ms: number;
  success: boolean;
  error?: string;
}

function buildGeminiEnv(parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  };

  for (const key of ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT_ID']) {
    const value = parentEnv[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

export async function runGemini(config: Config, prompt: string, input: string): Promise<GeminiResult> {
  const start = Date.now();
  
  const systemPrompt = `
SYSTEM ROLE:
You are a pure text-processing sidecar. 
You are NOT an agent. 
You have NO ACCESS to the filesystem. 
You CANNOT run tools (read_file, list_directory, bash, etc. are all DISABLED).
If you attempt to use a tool, you will fail.

TASK:
Summarize the provided tool output text. 
Your goal is "High-Fidelity Compression".
The primary agent (Claude/Codex) must be able to complete its task using ONLY your summary.

CONSTRAINTS:
1. DO NOT attempt to use any tools. 
2. DO NOT try to read the files mentioned in the output.
3. DO NOT try to run any shell commands.
4. Process ONLY the text provided under "TOOL OUTPUT FOLLOWS".

For all outputs:
1. Preserve all specific IDs, keys, URLs, names, and unique identifiers.
2. Maintain all critical data points, status codes, and error messages.
3. Be CONCISE. Use bullet points. Do not be wordy. 
4. The summary MUST be significantly shorter than the raw output.
5. Remove redundant metadata, repetitive boilerplate, and truly irrelevant noise.

If the output is structured data (JSON, Jira tickets, Figma files):
1. Transcribe the core data fields into a compact Markdown table or list.

Return Markdown with these sections:
## Summary
## Data Breakdown (High-Fidelity)
## Important Findings

INSTRUCTION:
${prompt}

TOOL OUTPUT FOLLOWS:
`;

  return new Promise((resolve) => {
    log(`Starting Gemini process: command="${config.gemini.command}", inputSize=${input.length}`);

    // --skip-trust: allows execution in headless/automated environments
    // --approval-mode plan: prevents Gemini from attempting to run tools
    const child = spawn(config.gemini.command, ['--skip-trust', '--approval-mode', 'plan', '-p', systemPrompt], {
      timeout: config.gemini.timeout_ms,
      env: buildGeminiEnv(process.env),
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      log(`[Gemini] STDOUT chunk received: bytes=${Buffer.byteLength(chunk, 'utf-8')}`);
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      log(`[Gemini] STDERR chunk received: bytes=${Buffer.byteLength(chunk, 'utf-8')}`);
    });

    const finish = (code: number | null, signal: string | null, error?: string) => {
      if (resolved) return;
      resolved = true;
      
      const duration = Date.now() - start;
      const success = code === 0 && !signal && !error;
      
      if (!success) {
        const errorMessage = error || stderr || `Process exited with code ${code} (signal: ${signal})`;
        log(`[Gemini] FAILED (${duration}ms): errorBytes=${Buffer.byteLength(errorMessage, 'utf-8')}`);
        resolve({
          summary: '',
          duration_ms: duration,
          success: false,
          error: errorMessage,
        });
      } else {
        log(`[Gemini] SUCCESS (${duration}ms). Output size: ${stdout.length}`);
        resolve({
          summary: stdout.trim(),
          duration_ms: duration,
          success: true,
        });
      }
    };

    child.on('close', (code, signal) => {
      log(`[Gemini] Process closed: code=${code}, signal=${signal}`);
      finish(code, signal);
    });

    child.on('error', (err: Error) => {
      log(`[Gemini] Child process error: ${err.message}`);
      finish(null, null, `Spawn error: ${err.message}`);
    });

    child.stdin.on('error', (err: any) => {
      log(`[Gemini] Child stdin error: ${err.message}`);
      if (err.code === 'EPIPE') {
        log('[Gemini] EPIPE: stdin closed unexpectedly.');
      }
    });

    try {
      log(`[Gemini] Writing ${input.length} chars to stdin...`);
      child.stdin.write(input, (err) => {
        if (err) {
          log(`[Gemini] Error in stdin callback: ${err.message}`);
        } else {
          log('[Gemini] stdin write complete');
        }
        child.stdin.end();
      });
    } catch (err: any) {
      log(`[Gemini] Immediate error writing to child stdin: ${err.message}`);
      finish(null, null, `Write error: ${err.message}`);
    }
  });
}
