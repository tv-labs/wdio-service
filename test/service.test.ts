import { randomInt, randomUUID } from 'crypto';
import { SevereServiceError } from 'webdriverio';
import TVLabsService, { type TVLabsCapabilities } from '../src/index.js';
import { SessionChannel } from '../src/channels/session.js';
import { BuildChannel } from '../src/channels/build.js';

import type { Options } from '@wdio/types';

vi.mock('../src/channels/session', () => {
  return {
    SessionChannel: vi.fn().mockImplementation(() => fakeSessionChannel),
  };
});

vi.mock('../src/channels/build', () => {
  return {
    BuildChannel: vi.fn().mockImplementation(() => fakeBuildChannel),
  };
});

vi.stubGlobal('process', { exit: vi.fn() });

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
