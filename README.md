# Gemini Agent Bridge

Gemini CLI sidecar bridge for coding agents (Claude Code, Codex, etc.).

When a tool call returns a large output, the bridge intercepts it via a PostToolUse hook, summarizes it with Gemini, and returns the summary to the agent — saving thousands of tokens per response.

## Install

```sh
npm install -g @thelumiereguy/gemini-agent-bridge
```

## Prerequisites

1. Install the Gemini CLI:
   ```sh
   npm install -g @google/gemini-cli
   ```
2. Authenticate:
   ```sh
   gemini auth login
   ```
3. Confirm it works:
   ```sh
   gemini --version
   ```
   If `gemini auth login` is not the correct subcommand for your installed version, run `gemini --help` to find the auth command.

## Quick start

```sh
gemini-agent-bridge doctor
```

## Hook setup — Claude Code

Add the following to your Claude Code settings (`~/.claude/settings.json` for global, or `.claude/settings.json` for per-project):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash|Grep|Read|Glob|LS|atlassian_.*|figma_.*|mcp__atlassian__.*|mcp__figma__.*",
        "hooks": [
          {
            "type": "command",
            "command": "gemini-agent-bridge claude-hook"
          }
        ]
      }
    ]
  }
}
```

The matcher targets file reads, searches, shell output, and Atlassian or Figma MCP tool output. Claude matchers are regexes, so use `figma_.*` rather than `figma_*` for wildcard-style matching. The hook receives tool output on stdin, delegates large outputs to Gemini, and returns the summary via `hookSpecificOutput.updatedToolOutput`. Outputs below the delegation threshold are passed through unchanged.

## Hook setup — Codex

Add the following to your Codex configuration (adapt to your installed Codex version's hook schema — the command name and response shape are confirmed, but the surrounding config structure may differ):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "exec_command|read_file|grep_search|list_directory|atlassian_.*|figma_.*|mcp__atlassian__.*|mcp__figma__.*",
        "hooks": [
          {
            "type": "command",
            "command": "gemini-agent-bridge codex-hook"
          }
        ]
      }
    ]
  }
}
```

The matcher targets Codex shell output, file reads, searches, directory listings, and Atlassian or Figma MCP tool output. The Codex hook returns `decision: "block"` with `additionalContext` containing the Gemini summary when delegation occurs.

## Configuration

### Config files (recommended)

Config is loaded in this order — later sources override earlier ones:

1. Built-in defaults
2. `~/.gemini-agent-bridge/config.json` — global, applies to all projects
3. `.gemini-agent-bridge.json` — per-project, checked in at the repo root

**Global config** (`~/.gemini-agent-bridge/config.json`):

```json
{
  "delegate": {
    "min_chars": 15000
  }
}
```

**Per-project config** (`.gemini-agent-bridge.json` in repo root):

```json
{
  "delegate": {
    "min_chars": 5000,
    "tool_overrides": {
      "Bash": { "min_chars": 10000 },
      "atlassian": { "min_chars": 2000 },
      "figma": { "min_chars": 5000 }
    }
  }
}
```

All fields are optional — only include what you want to override. Full config shape:

```json
{
  "enabled": true,
  "gemini": {
    "command": "gemini",
    "timeout_ms": 90000
  },
  "delegate": {
    "min_chars": 25000,
    "min_files": 4,
    "max_chars": 1500000,
    "tool_overrides": {
      "Grep": { "min_chars": 5000, "min_files": 2 },
      "Glob": { "min_chars": 5000, "min_files": 2 },
      "LS":   { "min_chars": 5000, "min_files": 2 },
      "atlassian": { "min_chars": 2000 },
      "figma": { "min_chars": 5000 },
      "mcp__": { "min_chars": 5000 }
    }
  },
  "exclude_paths": [".env", ".env.*", "**/*.pem", "**/*.key", "**/.git/**"],
  "metrics": { "enabled": true }
}
```

Dependency and generated output directories such as `node_modules`, `build`, and `dist` are not excluded by default. If Claude or Codex already produced that output, the bridge can usually save tokens by summarizing it before returning it to the agent. Use `max_chars` to skip outputs that are too large to summarize reliably.

## `doctor` output explained

```
Config enabled: true          — bridge is active; set enabled:false to disable without uninstalling
Gemini command: gemini        — resolved Gemini CLI binary
Gemini CLI version: x.y.z    — confirms gemini is on PATH and the binary runs (not a full auth check)
Min chars: 25000              — delegation threshold (characters, not tokens)
Max chars: 1500000            — outputs above this are skipped (too large for Gemini)
Min files: 4                  — delegation also triggers when this many unique files appear, regardless of char count (OR logic)
```

If `Gemini CLI: Not found or error [FAILED]` appears, run `gemini --version` manually to diagnose.

## Commands

| Command | Description |
|---------|-------------|
| `gemini-agent-bridge doctor` | Check configuration and Gemini CLI availability |
| `gemini-agent-bridge stats` | Show delegation counts and estimated tokens saved |
| `gemini-agent-bridge delegations` | Show the 10 most recent delegations |
| `gemini-agent-bridge logs` | Print the path to the log file for `tail -f` |
| `gemini-agent-bridge claude-hook` | PostToolUse hook entry point for Claude Code |
| `gemini-agent-bridge codex-hook` | PostToolUse hook entry point for Codex |

## Real-world savings

After running across Claude Code and Codex sessions:

```
$ gemini-agent-bridge stats
Gemini Agent Bridge - Stats
---------------------------
Total delegations: 41
Delegations today: 28
Total tokens saved: 179k
  - Codex: 100k saved
  - Claude: 78k saved
Average compression ratio: 5.2x
Average Gemini duration: 36.8s
```

```
$ gemini-agent-bridge delegations
Gemini Agent Bridge - Recent Delegations
----------------------------------------
11:37:48 PM Read(...)
  Original: ~7797 tokens
  Returned: ~880 tokens
  Saved: ~6916 tokens
  Compression: 8.85x
  Gemini: success

11:58:08 PM mcp__atlassian__getConfluencePage(...)
  Original: ~12299 tokens
  Returned: ~1477 tokens
  Saved: ~10822 tokens
  Compression: 8.33x
  Gemini: success

11:37:19 PM Read(...)
  Original: ~7500 tokens
  Returned: ~995 tokens
  Saved: ~6505 tokens
  Compression: 7.54x
  Gemini: success
```

## Troubleshooting

**Hook runs but nothing is summarized**
- Run `doctor` and check the threshold values. Your outputs may be below `min_chars`.
- Lower `delegate.min_chars` in `~/.gemini-agent-bridge/config.json` or `.gemini-agent-bridge.json`.

**`gemini: command not found` in hook**
- The hook inherits a limited PATH. Either set the full path in `gemini.command` in a config file, or ensure the Gemini CLI is installed in a standard location (`/usr/local/bin`, `/usr/bin`).

**Hook exits silently with no effect**
- Check logs: `tail -f $(gemini-agent-bridge logs | awk '{print $NF}')`
- The hook always exits 0 and writes `{}` on error to avoid breaking the agent.

**Outputs are too large and Gemini times out**
- Increase `gemini.timeout_ms` in a config file (default: 90000ms).
- Outputs above `max_chars` (1.5M chars) are skipped automatically.

## License

MIT
