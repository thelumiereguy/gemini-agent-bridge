# Agent Instructions

## Project

`gemini-agent-bridge` is a TypeScript Node CLI that acts as a Gemini CLI sidecar for coding-agent hook output.

## Commands

- `npm test` builds, typechecks source and tests, then runs Node's built-in test runner.
- `npm run coverage` runs the same checks with Node's native coverage report.
- `npm --cache /private/tmp/gemini-bridge-npm-cache pack --dry-run` is useful locally because the default `~/.npm` cache may have ownership issues.

## Publish Notes

- The package is public on npm as `@thelumiereguy/gemini-agent-bridge`.
- `dist/` is generated and intentionally ignored by git, but included in npm packages via `prepack`.
- Do not commit `node_modules`, `dist`, generated tarballs, logs, or npm cache output.

## Security Notes

- Do not log raw hook input, raw tool output, Gemini stdout/stderr content, or unredacted environment config values.
- Keep logging metadata-only by default: byte counts, parsed keys, tool names, output lengths, process status, and durations are acceptable.
- Preserve the redaction pass before sending tool output to Gemini.

## CI

- GitHub Actions runs tests on Node 20 and 22.
- Coverage runs as a separate job on Node 20.
- Publishing is tag-gated on `v*` tags and uses `npm publish --provenance`.
