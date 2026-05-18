import test from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/core/redaction';

test('redacts generic secret assignments while preserving labels', () => {
  const input = 'token: "abcdefghijklmnopqrstuvwxyz"';

  assert.equal(redact(input), 'token: "[REDACTED]"');
});

test('redacts environment credential assignments', () => {
  const input = 'SERVICE_SECRET_KEY=super-secret-value';

  assert.equal(redact(input), 'SERVICE_SECRET_KEY=[REDACTED]');
});

test('redacts authorization header tokens', () => {
  const input = 'Authorization: Bearer abcdefghijklmnop';

  assert.equal(redact(input), 'Authorization: Bearer [REDACTED]');
});

test('redacts jwt tokens', () => {
  const input = 'jwt=eyJheader.eyJpayload.signature';

  assert.equal(redact(input), 'jwt=[REDACTED_JWT]');
});

test('redacts aws keys and private keys', () => {
  const awsAccessKey = ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('');
  const awsSecretKey = [
    'abcdefghijklmnopqrst',
    'uvwxyzABCDEFGHIJKLMN',
  ].join('');
  const input = [
    `access=${awsAccessKey}`,
    `aws_secret_access_key=${awsSecretKey}`,
    '-----BEGIN RSA PRIVATE KEY-----',
    'secret',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  const redacted = redact(input);

  assert.match(redacted, /\[REDACTED_AWS_KEY\]/);
  assert.match(redacted, /aws_secret_access_key=\[REDACTED\]/);
  assert.match(redacted, /\[REDACTED_PRIVATE_KEY\]/);
  assert.equal(redacted.includes(awsAccessKey), false);
  assert.equal(redacted.includes(awsSecretKey), false);
  assert.doesNotMatch(redacted, /-----BEGIN RSA PRIVATE KEY-----/);
});

test('leaves ordinary text unchanged', () => {
  const input = 'No secrets here, just regular command output.';

  assert.equal(redact(input), input);
});
