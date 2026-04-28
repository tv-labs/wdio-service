import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TVLabsService } = require('../../cjs/index.js');

const createService = (options = {}) => {
  const serviceOptions = { apiKey: 'test-key', ...options };
  const capabilities = {};
  const config = { logLevel: 'silent' };
  return new TVLabsService(serviceOptions, capabilities, config);
};

describe('CJS Integration Tests', () => {
  it('should export TVLabsService', () => {
    expect(typeof TVLabsService).toBe('function');
  });

  it('should be instantiable with valid options', () => {
    const service = createService();
    expect(service).toBeInstanceOf(TVLabsService);
  });

  it('should have onPrepare method', () => {
    const service = createService();
    expect(typeof service.onPrepare).toBe('function');
  });

  it('should have beforeSession method', () => {
    const service = createService();
    expect(typeof service.beforeSession).toBe('function');
  });

  it('should reject multi-remote capabilities in onPrepare', () => {
    const service = createService({ continueOnError: true });
    const multiRemoteConfig = {
      capabilities: {
        browserA: { browserName: 'chrome' },
        browserB: { browserName: 'firefox' },
      },
    };

    expect(() => service.onPrepare(multiRemoteConfig, {})).toThrow(
      /multi-remote capabilities are not implemented/i,
    );
  });

  it('should have lastRequestId method', () => {
    const service = createService();
    expect(typeof service.lastRequestId).toBe('function');
  });

  it('should have requestMetadata method', () => {
    const service = createService();
    expect(typeof service.requestMetadata).toBe('function');
  });

  describe('fromSession', () => {
    it('should have a static fromSession method', () => {
      expect(typeof TVLabsService.fromSession).toBe('function');
    });

    it('should return a TVLabsService instance', () => {
      const capabilities = {};
      const wdOpts = { capabilities, logLevel: 'silent' };

      const service = TVLabsService.fromSession(
        'fake-session-id',
        { apiKey: 'test-key' },
        wdOpts,
      );

      expect(service).toBeInstanceOf(TVLabsService);
    });

    it('should not mutate tvlabs:session_id on capabilities', () => {
      const capabilities = {};
      const wdOpts = { capabilities, logLevel: 'silent' };

      TVLabsService.fromSession(
        'fake-session-id',
        { apiKey: 'test-key' },
        wdOpts,
      );

      expect(capabilities['tvlabs:session_id']).toBeUndefined();
    });

    it('should install transformRequest on wdOpts', () => {
      const capabilities = {};
      const wdOpts = { capabilities, logLevel: 'silent' };

      TVLabsService.fromSession(
        'fake-session-id',
        { apiKey: 'test-key' },
        wdOpts,
      );

      expect(typeof wdOpts.transformRequest).toBe('function');
    });

    it('should expose lastRequestId, requestMetadata, sessionMetadata, and appiumSessionId', () => {
      const capabilities = {};
      const wdOpts = { capabilities, logLevel: 'silent' };

      const service = TVLabsService.fromSession(
        'fake-session-id',
        { apiKey: 'test-key' },
        wdOpts,
      );

      expect(typeof service.lastRequestId).toBe('function');
      expect(typeof service.requestMetadata).toBe('function');
      expect(typeof service.sessionMetadata).toBe('function');
      expect(service.appiumSessionId).toBe('fake-session-id');
    });

    it('should inject Authorization header on wdOpts', () => {
      const capabilities = {};
      const wdOpts = { capabilities, logLevel: 'silent' };

      TVLabsService.fromSession(
        'fake-session-id',
        { apiKey: 'test-key' },
        wdOpts,
      );

      expect(wdOpts.headers?.Authorization).toBe('Bearer test-key');
    });
  });

  describe('Authorization header injection', () => {
    it('should inject Authorization header when not present', () => {
      const config = {};
      new TVLabsService({ apiKey: 'test-api-key' }, {}, config);

      expect(config.headers).toBeDefined();
      expect(config.headers.Authorization).toBe('Bearer test-api-key');
    });

    it('should not override existing Authorization header', () => {
      const config = {
        headers: {
          Authorization: 'Bearer existing-token',
        },
      };
      new TVLabsService({ apiKey: 'test-api-key' }, {}, config);

      expect(config.headers.Authorization).toBe('Bearer existing-token');
    });

    it('should preserve other headers when injecting Authorization', () => {
      const config = {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      };
      new TVLabsService({ apiKey: 'test-api-key' }, {}, config);

      expect(config.headers['X-Custom-Header']).toBe('custom-value');
      expect(config.headers.Authorization).toBe('Bearer test-api-key');
    });
  });
});
