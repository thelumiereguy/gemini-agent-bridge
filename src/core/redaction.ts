export function redact(text: string): string {
  let redacted = text;

  // Generic key/secret/token/password assignments (key = value, token: "value")
  redacted = redacted.replace(
    /(?:key|password|secret|token|auth)["']?\s*[:=]\s*["']?([a-zA-Z0-9-_.]{16,})["']?/gi,
    (match, p1) => match.replace(p1, '[REDACTED]')
  );

  // .env-style bare assignments: SECRET_KEY=abc123...
  redacted = redacted.replace(
    /^([A-Z_]{4,}(?:KEY|SECRET|TOKEN|PASSWORD|PASS|AUTH|CREDENTIAL)[A-Z_]*)=(.{8,})$/gm,
    (match, _name, val) => match.replace(val, '[REDACTED]')
  );

  // Authorization headers: Authorization: Bearer <token>
  redacted = redacted.replace(
    /Authorization:\s*(?:Bearer|Basic|Token)\s+([A-Za-z0-9\-._~+/]+=*)/gi,
    (match, token) => match.replace(token, '[REDACTED]')
  );

  // JWT tokens (three base64url segments separated by dots)
  redacted = redacted.replace(
    /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g,
    '[REDACTED_JWT]'
  );

  // AWS access key IDs
  redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]');

  // AWS secret access keys (40-char base64 after known field names)
  redacted = redacted.replace(
    /(?:aws_secret_access_key|SecretAccessKey)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    (match, val) => match.replace(val, '[REDACTED]')
  );

  // GCP service account private key JSON field
  redacted = redacted.replace(
    /"private_key"\s*:\s*"(-----BEGIN[^"]+-----END[^"]+-----(?:\\n)?)/g,
    '"private_key": "[REDACTED_PRIVATE_KEY]"'
  );

  // PEM private keys
  redacted = redacted.replace(
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  );

  return redacted;
}
