import { Config } from './config';
import { log } from './logger';

export interface DelegationContext {
  command: string;
  output: string;
  fileCount?: number;
}

export function shouldDelegate(config: Config, context: DelegationContext): { should: boolean; reason?: string } {
  const { command, output, fileCount = 0 } = context;
  const charCount = output.length;

  log(`[Delegation] START: command="${command}", chars=${charCount}, files=${fileCount}`);

  if (!config.enabled) {
    log('[Delegation] SKIP: Bridge is disabled');
    return { should: false, reason: 'Bridge is disabled' };
  }

  const mutatingKeywords = [
    'rm', 'mv', 'cp', 'npm install', 'npm uninstall', 'git commit', 'git push',
    'git merge', 'git rebase', 'git checkout', 'patch', 'sed -i'
  ];

  const hasMutatingKeyword = mutatingKeywords.some(kw => {
    // Use word boundaries for short keywords to avoid false positives like 'mcp' matching 'cp'
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`);
      return regex.test(command);
    }
    return command.includes(kw);
  });

  if (hasMutatingKeyword) {
    log(`[Delegation] SKIP: Mutating keyword found in "${command}"`);
    return { should: false, reason: 'Command appears to be mutating or destructive' };
  }

  const isExcluded = config.exclude_paths.some(p => {
    const regex = globToRegex(p);
    const matched = regex.test(command);
    if (matched) log(`[Delegation] Match exclusion: pattern="${p}", command="${command}"`);
    return matched;
  });

  if (isExcluded) {
    log('[Delegation] SKIP: Excluded path');
    return { should: false, reason: `Command targets an excluded path pattern` };
  }

  // Refuse outputs that exceed the hard cap — too large to summarize reliably
  if (charCount > config.delegate.max_chars) {
    log(`[Delegation] SKIP: Output too large (${charCount} > ${config.delegate.max_chars})`);
    return { should: false, reason: `Output too large (${charCount} chars > ${config.delegate.max_chars})` };
  }

  let effectiveMinChars = config.delegate.min_chars;
  let effectiveMinFiles = config.delegate.min_files;

  if (config.delegate.tool_overrides) {
    // Longest pattern wins to ensure specificity
    const sortedOverrides = Object.entries(config.delegate.tool_overrides)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [pattern, override] of sortedOverrides) {
      if (command.includes(pattern)) {
        if (override.min_chars !== undefined) effectiveMinChars = override.min_chars;
        if (override.min_files !== undefined) effectiveMinFiles = override.min_files;
        log(`[Delegation] Applying override: pattern="${pattern}", minChars=${effectiveMinChars}`);
        break;
      }
    }
  }

  log(`[Delegation] Final Check: ${charCount} >= ${effectiveMinChars} or ${fileCount} >= ${effectiveMinFiles}?`);

  if (charCount >= effectiveMinChars || fileCount >= effectiveMinFiles) {
    log('[Delegation] SUCCESS: Threshold met');
    return { should: true };
  }

  // Fallback: broad repo search commands get a lower char floor
  const searchCommands = [
    'rg', 'grep', 'find', 'fd', 'tree', 'ls -r',
    'Grep', 'Glob', 'LS', 'list_directory', 'grep_search'
  ];

  const lowerCommand = command.toLowerCase();
  const isSearch = searchCommands.some(c => {
    const lowerC = c.toLowerCase();
    return lowerCommand.startsWith(lowerC) || lowerCommand.includes(`${lowerC}(`) || command.includes(c);
  });

  if (isSearch && charCount >= 5000) {
    log('[Delegation] SUCCESS: Search command with substantial output');
    return { should: true, reason: 'Broad search with substantial output' };
  }

  log('[Delegation] SKIP: No criteria met');
  return { should: false, reason: `Does not meet delegation criteria (chars=${charCount}/${effectiveMinChars}, files=${fileCount}/${effectiveMinFiles})` };
}

function globToRegex(pattern: string): RegExp {
  let regexStr = '';

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];

    if (char === '*' && next === '*') {
      const following = pattern[i + 2];
      if (following === '/') {
        regexStr += '(?:.*/)?';
        i += 2;
      } else {
        regexStr += '.*';
        i++;
      }
      continue;
    }

    if (char === '*') {
      regexStr += '[^/]*';
      continue;
    }

    regexStr += escapeRegex(char);
  }

  return new RegExp(`(?:^|[\\s"'/])${regexStr}(?:$|[\\s"'])`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
