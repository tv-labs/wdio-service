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
