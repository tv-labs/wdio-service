import { randomInt, randomUUID } from 'crypto';
import { SevereServiceError } from 'webdriverio';
import TVLabsService, { type TVLabsCapabilities } from '../src/index.js';
import { SessionChannel } from '../src/channels/session.js';
import { BuildChannel } from '../src/channels/build.js';
import { MetadataChannel } from '../src/channels/metadata.js';
import { getSessionMetadata } from '../src/api/sessions.js';

import type { Options } from '@wdio/types';

vi.mock('../src/channels/session', () => {
  return {
    SessionChannel: vi.fn(function (this: unknown) {
      return fakeSessionChannel;
    }),
  };
});

vi.mock('../src/channels/build', () => {
  return {
    BuildChannel: vi.fn(function (this: unknown) {
      return fakeBuildChannel;
    }),
  };
});

vi.mock('../src/channels/metadata', () => {
  return {
    MetadataChannel: vi.fn(function (this: unknown) {
      return fakeMetadataChannel;
    }),
  };
});

vi.mock('../src/api/sessions', () => {
  return {
    getSessionMetadata: vi.fn(),
  };
});

vi.stubGlobal('process', { exit: vi.fn(), env: {} });

describe('TVLabsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be a function', () => {
    expect(TVLabsService).toBeInstanceOf(Function);
  });

  it('can be instantiated', () => {
    const options = { apiKey: 'my-api-key' };
    const capabilities: TVLabsCapabilities = {
      'tvlabs:constraints': {
        platform_key: 'roku',
      },
      'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
    };
    const config = {};

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
  });

  it('sets transformRequest to include a request id', () => {
    const options = { apiKey: 'my-api-key' };
    const capabilities: TVLabsCapabilities = {};
    const config: Options.WebdriverIO = {};

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
    expect(config.transformRequest).toBeDefined();
    expect(config.transformRequest).toBeInstanceOf(Function);

    const requestInit: RequestInit = {
      method: 'GET',
    };

    const transformedRequestInit = config.transformRequest?.(requestInit);

    expect(transformedRequestInit?.headers).toEqual({
      'x-request-id': expect.any(String),
    });
  });

  it('does not set transformRequest if attachRequestId is false', () => {
    const options = { apiKey: 'my-api-key', attachRequestId: false };
    const capabilities: TVLabsCapabilities = {};
    const config: Options.WebdriverIO = {};

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
    expect(config.transformRequest).not.toBeDefined();
  });

  describe('Authorization header injection', () => {
    it('injects Authorization header when not present', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      new TVLabsService(options, capabilities, config);

      expect(config.headers).toBeDefined();
      expect(config.headers?.Authorization).toBe('Bearer my-api-key');
    });

    it('does not override existing Authorization header', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {
        headers: {
          Authorization: 'Bearer existing-token',
        },
      };

      new TVLabsService(options, capabilities, config);

      expect(config.headers?.Authorization).toBe('Bearer existing-token');
    });

    it('preserves other existing headers', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {
        headers: {
          'X-Custom-Header': 'custom-value',
          'User-Agent': 'my-agent',
        },
      };

      new TVLabsService(options, capabilities, config);

      expect(config.headers).toEqual({
        'X-Custom-Header': 'custom-value',
        'User-Agent': 'my-agent',
        Authorization: 'Bearer my-api-key',
      });
    });
  });

  describe('lastRequestId', () => {
    it('returns undefined initially', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(service.lastRequestId()).toBeUndefined();
    });

    it('returns undefined when attachRequestId is false', () => {
      const options = { apiKey: 'my-api-key', attachRequestId: false };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(service.lastRequestId()).toBeUndefined();
    });

    it('returns the last request ID after a request is transformed', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(service.lastRequestId()).toBeUndefined();

      const requestInit: RequestInit = {
        method: 'GET',
      };

      const transformedRequestInit = config.transformRequest?.(requestInit);

      const requestId = service.lastRequestId();
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Verify the request ID matches the one in the headers
      const headers = transformedRequestInit?.headers as Record<string, string>;
      expect(headers['x-request-id']).toBe(requestId);
    });

    it('returns the most recent request ID when multiple requests are made', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      const requestInit1: RequestInit = { method: 'GET' };
      const transformedRequestInit1 = config.transformRequest?.(requestInit1);
      const requestId1 = service.lastRequestId();

      const requestInit2: RequestInit = { method: 'POST' };
      const transformedRequestInit2 = config.transformRequest?.(requestInit2);
      const requestId2 = service.lastRequestId();

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);

      // lastRequestId should return the most recent one
      expect(service.lastRequestId()).toBe(requestId2);

      // Verify headers match
      const headers1 = transformedRequestInit1?.headers as Record<
        string,
        string
      >;
      const headers2 = transformedRequestInit2?.headers as Record<
        string,
        string
      >;
      expect(headers1['x-request-id']).toBe(requestId1);
      expect(headers2['x-request-id']).toBe(requestId2);
    });
  });

  it('does not clobber existing values in headers', () => {
    const options = { apiKey: 'my-api-key' };
    const capabilities: TVLabsCapabilities = {};
    const config: Options.WebdriverIO = {};

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
    expect(config.transformRequest).toBeDefined();
    expect(config.transformRequest).toBeInstanceOf(Function);

    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        'x-existing-header': 'existing-value',
      },
    };

    const transformedRequestInit = config.transformRequest?.(requestInit);

    expect(transformedRequestInit?.headers).toEqual({
      'x-existing-header': 'existing-value',
      'x-request-id': expect.any(String),
    });
  });

  it('does not override existing transformRequest function', () => {
    const options = { apiKey: 'my-api-key' };
    const capabilities: TVLabsCapabilities = {};
    const config: Options.WebdriverIO = {
      transformRequest: (requestOptions: RequestInit) => {
        requestOptions.headers = {
          'x-existing-transform': 'existing-transform-value',
        };

        return requestOptions;
      },
    };

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
    expect(config.transformRequest).toBeDefined();
    expect(config.transformRequest).toBeInstanceOf(Function);

    const requestInit: RequestInit = {
      method: 'GET',
    };

    const transformedRequestInit = config.transformRequest?.(requestInit);

    expect(transformedRequestInit?.headers).toEqual({
      'x-request-id': expect.any(String),
      'x-existing-transform': 'existing-transform-value',
    });
  });

  describe('onPrepare', () => {
    it('does not throw if no multi-remote capabilities are provided', () => {
      const options = { apiKey: 'my-api-key' };
      const config = {};
      const capabilities: TVLabsCapabilities = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(() => service.onPrepare(config, [capabilities])).not.toThrow();
    });

    it('throws if multi-remote capabilities are provided', () => {
      const options = { apiKey: 'my-api-key', continueOnError: true };
      const config = {};
      const capabilities = {
        remoteOne: { capabilities: {} },
        remoteTwo: { capabilities: {} },
      };

      const service = new TVLabsService(options, {}, config);

      expect(() => service.onPrepare(config, capabilities)).toThrowError(
        'Multi-remote capabilities are not implemented. Contact TV Labs support if you are interested in this feature.',
      );
      expect(vi.mocked(process).exit).not.toHaveBeenCalledWith(1);
    });

    it('exits on error when continueOnError is false', () => {
      const options = { apiKey: 'my-api-key', continueOnError: false };
      const config = {};
      const capabilities = {
        remoteOne: { capabilities: {} },
        remoteTwo: { capabilities: {} },
      };

      const service = new TVLabsService(options, {}, config);

      expect(() => service.onPrepare(config, capabilities)).toThrowError(
        'Multi-remote capabilities are not implemented. Contact TV Labs support if you are interested in this feature.',
      );
      expect(vi.mocked(process).exit).toHaveBeenCalledWith(1);
    });
  });

  describe('beforeSession', () => {
    it('requests a session and modifies the provided capabilities', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {
        'tvlabs:constraints': {
          platform_key: 'roku',
        },
        'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
      };

      fakeSessionChannel.newSession.mockResolvedValue(sessionId);

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, specs, cid);

      expect(fakeSessionChannel.connect).toHaveBeenCalled();
      expect(fakeSessionChannel.newSession).toHaveBeenCalledWith(
        capabilities,
        expect.any(Number),
      );
      expect(capabilities['tvlabs:session_id']).toEqual(sessionId);
    });

    it('passes set options to the channel', async () => {
      const config: Options.WebdriverIO = { logLevel: 'info' };
      const specs: string[] = [];
      const cid = '';
      const capabilities: TVLabsCapabilities = {};
      const options = {
        apiKey: randomUUID(),
        retries: randomInt(1, 10),
        reconnectRetries: randomInt(1, 10),
        sessionEndpoint: randomUUID(),
      };

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, specs, cid);

      expect(vi.mocked(SessionChannel)).toHaveBeenCalledWith(
        options.sessionEndpoint,
        options.reconnectRetries,
        options.apiKey,
        config.logLevel,
      );
      expect(fakeSessionChannel.newSession).toHaveBeenCalledWith(
        capabilities,
        options.retries,
      );
    });

    it('bubbles any errors from the channel', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const options = { apiKey: 'my-api-key', continueOnError: true };
      const capabilities: TVLabsCapabilities = {};

      fakeSessionChannel.newSession.mockRejectedValue(
        new SevereServiceError('Could not create a new session.'),
      );

      const service = new TVLabsService(options, capabilities, config);

      await expect(
        service.beforeSession(config, capabilities, specs, cid),
      ).rejects.toThrow('Could not create a new session.');
      expect(vi.mocked(process).exit).not.toHaveBeenCalledWith(1);
    });

    it('exits on error when continueOnError is false', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const options = { apiKey: 'my-api-key', continueOnError: false };
      const capabilities: TVLabsCapabilities = {};

      fakeSessionChannel.newSession.mockRejectedValue(
        new SevereServiceError('Could not create a new session.'),
      );

      const service = new TVLabsService(options, capabilities, config);

      await expect(
        service.beforeSession(config, capabilities, specs, cid),
      ).rejects.toThrow('Could not create a new session.');
      expect(vi.mocked(process).exit).toHaveBeenCalledWith(1);
    });

    it('creates build channel and uploads build when buildPath is provided', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const buildId = randomUUID();
      const sessionId = randomUUID();
      const buildPath = '/path/to/app.apk';
      const options = {
        apiKey: 'my-api-key',
        buildPath,
        buildEndpoint: 'wss://build.example.com',
        reconnectRetries: 3,
      };
      const capabilities: TVLabsCapabilities = {};

      fakeBuildChannel.uploadBuild.mockResolvedValue(buildId);
      fakeSessionChannel.newSession.mockResolvedValue(sessionId);

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, specs, cid);

      expect(vi.mocked(BuildChannel)).toHaveBeenCalledWith(
        options.buildEndpoint,
        options.reconnectRetries,
        options.apiKey,
        'info',
      );

      expect(fakeBuildChannel.connect).toHaveBeenCalled();
      expect(fakeBuildChannel.uploadBuild).toHaveBeenCalledWith(
        buildPath,
        undefined, // no app slug provided
      );
      expect(fakeBuildChannel.disconnect).toHaveBeenCalled();

      expect(capabilities['tvlabs:session_id']).toEqual(sessionId);
      expect(capabilities['tvlabs:build']).toEqual(buildId);
    });

    it('passes app slug to uploadBuild when app is provided', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const buildId = randomUUID();
      const sessionId = randomUUID();
      const buildPath = '/path/to/app.apk';
      const appSlug = 'my-awesome-app';
      const options = {
        apiKey: 'my-api-key',
        buildPath,
        app: appSlug,
      };
      const capabilities: TVLabsCapabilities = {};

      fakeBuildChannel.uploadBuild.mockResolvedValue(buildId);
      fakeSessionChannel.newSession.mockResolvedValue(sessionId);

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, specs, cid);

      expect(fakeBuildChannel.uploadBuild).toHaveBeenCalledWith(
        buildPath,
        appSlug,
      );

      expect(capabilities['tvlabs:session_id']).toEqual(sessionId);
      expect(capabilities['tvlabs:build']).toEqual(buildId);
    });

    it('aborts operation and raises error when build upload fails', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const buildPath = '/path/to/app.apk';
      const options = {
        apiKey: 'my-api-key',
        buildPath,
        continueOnError: true,
      };
      const capabilities: TVLabsCapabilities = {};

      fakeBuildChannel.uploadBuild.mockRejectedValue(
        new SevereServiceError('Failed to upload build'),
      );

      const service = new TVLabsService(options, capabilities, config);

      await expect(
        service.beforeSession(config, capabilities, specs, cid),
      ).rejects.toThrow('Failed to upload build');

      expect(fakeBuildChannel.connect).toHaveBeenCalled();
      expect(fakeBuildChannel.uploadBuild).toHaveBeenCalled();

      expect(vi.mocked(SessionChannel)).not.toHaveBeenCalled();
      expect(fakeSessionChannel.connect).not.toHaveBeenCalled();
      expect(fakeSessionChannel.newSession).not.toHaveBeenCalled();

      expect(capabilities['tvlabs:session_id']).toBeUndefined();
      expect(capabilities['tvlabs:build']).toBeUndefined();
    });

    it('does not create build channel when buildPath is not provided', async () => {
      const config = {};
      const specs: string[] = [];
      const cid = '';
      const sessionId = randomUUID();
      const options = {
        apiKey: 'my-api-key',
        // No buildPath provided
      };
      const capabilities: TVLabsCapabilities = {};

      fakeSessionChannel.newSession.mockResolvedValue(sessionId);

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, specs, cid);

      expect(vi.mocked(BuildChannel)).not.toHaveBeenCalled();
      expect(fakeBuildChannel.connect).not.toHaveBeenCalled();
      expect(fakeBuildChannel.uploadBuild).not.toHaveBeenCalled();

      expect(capabilities['tvlabs:session_id']).toEqual(sessionId);
      expect(capabilities['tvlabs:build']).toBeUndefined();
    });
  });

  describe('requestMetadata', () => {
    it('returns metadata for a single request ID', async () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};
      const sessionId = randomUUID();
      const requestId = randomUUID();
      const mockMetadata = {
        path: '/session/123/element',
        method: 'POST',
        status: 200,
      };

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId]: mockMetadata,
      });

      const service = new TVLabsService(options, capabilities, config);
      const result = await service.requestMetadata(sessionId, requestId);

      expect(fakeMetadataChannel.connect).toHaveBeenCalled();
      expect(fakeMetadataChannel.getRequestMetadata).toHaveBeenCalledWith(
        sessionId,
        [requestId],
      );
      expect(result).toEqual(mockMetadata);
    });

    it('returns metadata for multiple request IDs', async () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};
      const sessionId = randomUUID();
      const requestId1 = randomUUID();
      const requestId2 = randomUUID();
      const mockMetadataResponse = {
        [requestId1]: {
          path: '/session/123/element',
          method: 'POST',
          status: 200,
        },
        [requestId2]: {
          path: '/session/123/element/456/click',
          method: 'POST',
          status: 200,
        },
      };

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue(
        mockMetadataResponse,
      );

      const service = new TVLabsService(options, capabilities, config);
      const result = await service.requestMetadata(sessionId, [
        requestId1,
        requestId2,
      ]);

      expect(fakeMetadataChannel.connect).toHaveBeenCalled();
      expect(fakeMetadataChannel.getRequestMetadata).toHaveBeenCalledWith(
        sessionId,
        [requestId1, requestId2],
      );
      expect(result).toEqual(mockMetadataResponse);
    });

    it('reuses metadata channel on subsequent calls', async () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};
      const sessionId = randomUUID();
      const requestId1 = randomUUID();
      const requestId2 = randomUUID();

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId1]: { data: 'test1' },
      });

      const service = new TVLabsService(options, capabilities, config);

      await service.requestMetadata(sessionId, requestId1);
      expect(fakeMetadataChannel.connect).toHaveBeenCalledTimes(1);

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId2]: { data: 'test2' },
      });

      await service.requestMetadata(sessionId, requestId2);
      expect(fakeMetadataChannel.connect).toHaveBeenCalledTimes(1);
      expect(fakeMetadataChannel.getRequestMetadata).toHaveBeenCalledTimes(2);
    });

    it('passes correct options to MetadataChannel constructor', async () => {
      const config: Options.WebdriverIO = { logLevel: 'debug' };
      const capabilities: TVLabsCapabilities = {};
      const options = {
        apiKey: randomUUID(),
        reconnectRetries: randomInt(1, 10),
        sessionEndpoint: 'wss://custom.endpoint.com',
      };
      const sessionId = randomUUID();
      const requestId = randomUUID();

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId]: {},
      });

      const service = new TVLabsService(options, capabilities, config);
      await service.requestMetadata(sessionId, requestId);

      expect(vi.mocked(MetadataChannel)).toHaveBeenCalledWith(
        options.sessionEndpoint,
        options.reconnectRetries,
        options.apiKey,
        config.logLevel,
      );
    });

    it('uses default sessionEndpoint when not provided', async () => {
      const config: Options.WebdriverIO = {};
      const capabilities: TVLabsCapabilities = {};
      const options = {
        apiKey: 'test-api-key',
      };
      const sessionId = randomUUID();
      const requestId = randomUUID();

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId]: {},
      });

      const service = new TVLabsService(options, capabilities, config);
      await service.requestMetadata(sessionId, requestId);

      expect(vi.mocked(MetadataChannel)).toHaveBeenCalledWith(
        'wss://tvlabs.ai/appium',
        5, // default reconnectRetries
        options.apiKey,
        'info', // default logLevel
      );
    });
  });

  describe('sessionMetadata', () => {
    it('returns session metadata', async () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};
      const sessionId = randomUUID();
      const mockResponse = {
        id: sessionId,
        recording_started_at: '2026-04-21T12:00:00Z',
        recording_ended_at: '2026-04-21T12:05:00Z',
      };

      vi.mocked(getSessionMetadata).mockResolvedValue(mockResponse);

      const service = new TVLabsService(options, capabilities, config);
      const result = await service.sessionMetadata(sessionId);

      expect(result).toEqual(mockResponse);
      expect(getSessionMetadata).toHaveBeenCalledWith(
        {
          baseUrl: 'https://www.tvlabs.ai',
          apiKey: 'my-api-key',
          logLevel: 'info',
        },
        sessionId,
      );
    });

    it('passes custom apiBaseUrl when provided', async () => {
      const options = {
        apiKey: 'my-api-key',
        apiBaseUrl: 'https://custom.tvlabs.ai',
      };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = { logLevel: 'debug' };
      const sessionId = randomUUID();

      vi.mocked(getSessionMetadata).mockResolvedValue({});

      const service = new TVLabsService(options, capabilities, config);
      await service.sessionMetadata(sessionId);

      expect(getSessionMetadata).toHaveBeenCalledWith(
        {
          baseUrl: 'https://custom.tvlabs.ai',
          apiKey: 'my-api-key',
          logLevel: 'debug',
        },
        sessionId,
      );
    });

    it('propagates errors from getSessionMetadata', async () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};
      const sessionId = randomUUID();

      vi.mocked(getSessionMetadata).mockRejectedValue(
        new Error('API request failed: 404 Not Found'),
      );

      const service = new TVLabsService(options, capabilities, config);

      await expect(service.sessionMetadata(sessionId)).rejects.toThrow(
        'API request failed: 404 Not Found',
      );
    });
  });

  describe('disconnect', () => {
    it('is a no-op when no metadata channel was opened', async () => {
      const service = new TVLabsService(
        { apiKey: 'my-api-key' },
        {},
        {},
      );

      await expect(service.disconnect()).resolves.toBeUndefined();
      expect(fakeMetadataChannel.disconnect).not.toHaveBeenCalled();
    });

    it('closes the metadata channel after requestMetadata opened it', async () => {
      const service = new TVLabsService(
        { apiKey: 'my-api-key' },
        {},
        {},
      );
      const sessionId = randomUUID();
      const requestId = randomUUID();

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId]: {},
      });
      fakeMetadataChannel.disconnect.mockResolvedValue(undefined);

      await service.requestMetadata(sessionId, requestId);
      await service.disconnect();

      expect(fakeMetadataChannel.disconnect).toHaveBeenCalledTimes(1);

      // Subsequent disconnect calls are no-ops
      await service.disconnect();
      expect(fakeMetadataChannel.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('fromSession', () => {
    it('returns a TVLabsService instance synchronously', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(service).toBeInstanceOf(TVLabsService);
    });

    it('does not mutate tvlabs:session_id on the capabilities', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(capabilities['tvlabs:session_id']).toBeUndefined();
    });

    it('installs transformRequest on wdOpts for request-id tracking', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(typeof wdOpts.transformRequest).toBe('function');
    });

    it('does not install transformRequest when attachRequestId is false', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key', attachRequestId: false };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(wdOpts.transformRequest).toBeUndefined();
    });

    it('injects Authorization header on wdOpts', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(wdOpts.headers?.Authorization).toBe('Bearer my-api-key');
    });

    it('lastRequestId returns the most recent ID after transformRequest fires', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(service.lastRequestId()).toBeUndefined();

      // Simulate a request going through the transformRequest hook
      const requestOptions: RequestInit = { headers: {} };
      wdOpts.transformRequest!(requestOptions);

      const firstRequestId = service.lastRequestId();
      expect(firstRequestId).toBeDefined();
      expect(typeof firstRequestId).toBe('string');

      // Make another request - should return the newest ID
      wdOpts.transformRequest!(requestOptions);
      const secondRequestId = service.lastRequestId();
      expect(secondRequestId).toBeDefined();
      expect(secondRequestId).not.toBe(firstRequestId);
    });

    it('appiumSessionId getter returns the bound Appium session ID', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      expect(service.appiumSessionId).toBe(sessionId);
    });

    it('appiumSessionId getter returns undefined for classic instances', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(service.appiumSessionId).toBeUndefined();
    });

    it('beforeSession throws on a rehydrated instance', async () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      await expect(
        service.beforeSession(wdOpts, capabilities, [], ''),
      ).rejects.toThrow(SevereServiceError);
      await expect(
        service.beforeSession(wdOpts, capabilities, [], ''),
      ).rejects.toThrow('beforeSession() is not valid on a rehydrated service');
    });

    it('requestMetadata works without beforeSession', async () => {
      const sessionId = randomUUID();
      const requestId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };
      const mockMetadata = {
        path: '/session/123/element',
        method: 'POST',
        status: 200,
      };

      fakeMetadataChannel.getRequestMetadata.mockResolvedValue({
        [requestId]: mockMetadata,
      });

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);
      const result = await service.requestMetadata(sessionId, requestId);

      expect(fakeMetadataChannel.connect).toHaveBeenCalled();
      expect(fakeMetadataChannel.getRequestMetadata).toHaveBeenCalledWith(
        sessionId,
        [requestId],
      );
      expect(result).toEqual(mockMetadata);
    });

    it('sessionMetadata works without beforeSession', async () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };
      const mockResponse = {
        id: sessionId,
        recording_started_at: '2026-04-21T12:00:00Z',
      };

      vi.mocked(getSessionMetadata).mockResolvedValue(mockResponse);

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);
      const result = await service.sessionMetadata(sessionId);

      expect(result).toEqual(mockResponse);
      expect(getSessionMetadata).toHaveBeenCalledWith(
        {
          baseUrl: 'https://www.tvlabs.ai',
          apiKey: 'my-api-key',
          logLevel: 'info',
        },
        sessionId,
      );
    });

    it('throws when capabilities is missing', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const wdOpts: Options.WebdriverIO = {};

      expect(() =>
        TVLabsService.fromSession(sessionId, options, wdOpts),
      ).toThrow(SevereServiceError);
      expect(() =>
        TVLabsService.fromSession(sessionId, options, wdOpts),
      ).toThrow('wdOpts.capabilities must be a capabilities object');
    });

    it('throws when capabilities is an array (multi-remote)', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const wdOpts = { capabilities: [] } as unknown as Options.WebdriverIO;

      expect(() =>
        TVLabsService.fromSession(sessionId, options, wdOpts),
      ).toThrow(SevereServiceError);
    });

    describe('validate: true', () => {
      it('returns a Promise that resolves to a TVLabsService', async () => {
        const sessionId = randomUUID();
        const options = { apiKey: 'my-api-key', validate: true as const };
        const capabilities: TVLabsCapabilities = {};
        const wdOpts: Options.WebdriverIO = { capabilities };

        vi.mocked(getSessionMetadata).mockResolvedValue({
          id: sessionId,
        });

        const result = TVLabsService.fromSession(sessionId, options, wdOpts);

        expect(result).toBeInstanceOf(Promise);

        const service = await result;
        expect(service).toBeInstanceOf(TVLabsService);
        expect(service.appiumSessionId).toBe(sessionId);
      });

      it('calls getSessionMetadata to validate the session', async () => {
        const sessionId = randomUUID();
        const options = { apiKey: 'my-api-key', validate: true as const };
        const capabilities: TVLabsCapabilities = {};
        const wdOpts: Options.WebdriverIO = { capabilities };

        vi.mocked(getSessionMetadata).mockResolvedValue({});

        await TVLabsService.fromSession(sessionId, options, wdOpts);

        expect(getSessionMetadata).toHaveBeenCalledWith(
          {
            baseUrl: 'https://www.tvlabs.ai',
            apiKey: 'my-api-key',
            logLevel: 'info',
          },
          sessionId,
        );
      });

      it('rejects with SevereServiceError when session is not found', async () => {
        const sessionId = randomUUID();
        const options = { apiKey: 'my-api-key', validate: true as const };
        const capabilities: TVLabsCapabilities = {};
        const wdOpts: Options.WebdriverIO = { capabilities };

        vi.mocked(getSessionMetadata).mockRejectedValue(
          new Error('API request failed: 404 Not Found'),
        );

        await expect(
          TVLabsService.fromSession(sessionId, options, wdOpts),
        ).rejects.toThrow(SevereServiceError);
        await expect(
          TVLabsService.fromSession(sessionId, options, wdOpts),
        ).rejects.toThrow(`Cannot rehydrate: session ${sessionId}`);
      });
    });
  });
});

const fakeSessionChannel = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSession: vi.fn(),
};

const fakeBuildChannel = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  uploadBuild: vi.fn(),
};

const fakeMetadataChannel = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  getRequestMetadata: vi.fn(),
};
