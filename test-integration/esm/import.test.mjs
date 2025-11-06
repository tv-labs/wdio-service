import { describe, it, expect } from 'vitest';
import { TVLabsService } from '../../esm/index.js';

const createService = (options = {}) => {
  const serviceOptions = { apiKey: 'test-key', ...options };
  const capabilities = {};
  const config = { logLevel: 'silent' };
  return new TVLabsService(serviceOptions, capabilities, config);
};

describe('ESM Integration Tests', () => {
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
      /multi-remote capabilities are not implemented/i
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
});
