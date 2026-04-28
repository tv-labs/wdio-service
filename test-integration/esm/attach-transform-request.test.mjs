/**
 * Integration test: verifies that `transformRequest` installed by
 * `TVLabsService.fromSession()` is actually invoked when WebdriverIO's
 * `attach()` issues HTTP requests to the WebDriver server.
 *
 * This proves the end-to-end claim of `fromSession()`: that
 * `lastRequestId()` and `x-request-id` header injection work on the
 * attaching driver, not just on the driver that created the session.
 */
import { createServer } from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { attach } from 'webdriverio';
import { TVLabsService } from '../../esm/index.js';

// ---------------------------------------------------------------------------
// Minimal WebDriver stub server
// ---------------------------------------------------------------------------

let server;
let serverPort;

/** Captured headers from the most recent request to the stub. */
let lastRequestHeaders = {};

function startStubServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      lastRequestHeaders = req.headers;

      // Respond with a minimal valid WebDriver JSON response for any endpoint
      const body = JSON.stringify({ value: null });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      });
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopStubServer() {
  return new Promise((resolve) => server.close(resolve));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fromSession() + attach() — transformRequest end-to-end', () => {
  beforeAll(() => startStubServer());
  afterAll(() => stopStubServer());

  it('installs x-request-id on requests issued by the attached driver', async () => {
    const appiumSessionId = 'test-appium-session-id';

    const wdOpts = {
      hostname: '127.0.0.1',
      port: serverPort,
      capabilities: {},
      logLevel: 'silent',
    };

    // fromSession() mutates wdOpts.transformRequest in place
    const service = TVLabsService.fromSession(
      appiumSessionId,
      { apiKey: 'test-key' },
      wdOpts,
    );

    // attach() merges wdOpts and reads transformRequest from it
    const driver = await attach({
      sessionId: appiumSessionId,
      ...wdOpts,
      options: wdOpts,
    });

    // Trigger an HTTP request through the attached driver.
    // executeScript hits POST /session/:id/execute/sync — a simple
    // command that doesn't require a real browser to respond to.
    await driver.execute('return 1').catch(() => {
      // Stub returns `{ value: null }` which is valid; ignore any parse errors.
    });

    expect(lastRequestHeaders['x-request-id']).toBeDefined();
    expect(typeof lastRequestHeaders['x-request-id']).toBe('string');
    expect(lastRequestHeaders['x-request-id']).toHaveLength(36); // UUID v4

    expect(service.lastRequestId()).toBe(lastRequestHeaders['x-request-id']);
  });

  it('lastRequestId() tracks the most recent request through the attached driver', async () => {
    const appiumSessionId = 'test-appium-session-id-2';

    const wdOpts = {
      hostname: '127.0.0.1',
      port: serverPort,
      capabilities: {},
      logLevel: 'silent',
    };

    const service = TVLabsService.fromSession(
      appiumSessionId,
      { apiKey: 'test-key' },
      wdOpts,
    );

    const driver = await attach({
      sessionId: appiumSessionId,
      ...wdOpts,
      options: wdOpts,
    });

    // First request
    await driver.execute('return 1').catch(() => {});
    const firstId = service.lastRequestId();

    // Second request — id should change
    await driver.execute('return 2').catch(() => {});
    const secondId = service.lastRequestId();

    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(firstId).not.toBe(secondId);
  });
});
