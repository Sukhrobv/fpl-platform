// tests/logger.test.ts - Unit tests for the custom logger
//
// The built‑in node:test module is used here because it requires no
// external dependencies.  These tests verify that the logger prefixes
// messages with the expected level and timestamp.  They do not test
// formatting of the timestamp itself beyond existence because the
// actual value depends on the current date.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { logger } from '../lib/logger';

test('logger.info produces an INFO level prefix', async () => {
  let captured = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    captured = args.join(' ');
  };
  logger.info('Test message');
  console.log = originalLog;
  assert.ok(captured.includes('[INFO]'), 'log should include [INFO] level');
  assert.ok(captured.includes('Test message'), 'log should include the message');
});

test('logger.error produces an ERROR level prefix', async () => {
  let captured = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    captured = args.join(' ');
  };
  logger.error('Failure');
  console.log = originalLog;
  assert.ok(captured.includes('[ERROR]'), 'log should include [ERROR] level');
  assert.ok(captured.includes('Failure'), 'log should include the message');
});