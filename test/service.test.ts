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

  it('does not attach a request id if attachRequestId is false', () => {
    const options = { apiKey: 'my-api-key', attachRequestId: false };
    const capabilities: TVLabsCapabilities = {};
    const config: Options.WebdriverIO = {};

    const service = new TVLabsService(options, capabilities, config);

    expect(service).toBeInstanceOf(TVLabsService);
    expect(config.transformRequest).toBeInstanceOf(Function);

    const requestInit: RequestInit = { method: 'GET' };
    const transformedRequestInit = config.transformRequest?.(requestInit);

    expect(transformedRequestInit?.headers).not.toBeDefined();
    expect(service.lastRequestId()).not.toBeDefined();
  });

  describe('session id injection into POST /session (v9 fetch shape)', () => {
    const sessionId = 'f0d2a2c8-2ba0-4e4d-9c31-4a7c6bd0f8f6';

    const newSessionBody = (
      alwaysMatch: Record<string, unknown> = {},
      firstMatch?: Record<string, unknown>[],
    ) =>
      JSON.stringify({
        capabilities: firstMatch
          ? { alwaysMatch, firstMatch }
          : { alwaysMatch },
      });

    const sessionRequest = (body: string): RequestInit => ({
      method: 'POST',
      body,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': `${new TextEncoder().encode(body).length}`,
      }),
    });

    const bodyOf = (requestInit: RequestInit | undefined) =>
      JSON.parse(requestInit?.body as string);

    const startedService = async (
      config: Options.WebdriverIO,
      options: Parameters<typeof TVLabsService>[0] = { apiKey: 'my-api-key' },
    ) => {
      const capabilities: TVLabsCapabilities = {};

      fakeSessionChannel.newSession.mockResolvedValue(sessionId);

      const service = new TVLabsService(options, capabilities, config);

      await service.beforeSession(config, capabilities, [], '');

      return service;
    };

    it('re-attaches the session id when the capabilities have absent tvlabs:session_id', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      // Simulates a framework that cloned capabilities before `remote()`,
      // dropping the capability `beforeSession()` wrote.
      const requestInit = sessionRequest(
        newSessionBody({ 'appium:platformName': 'iOS' }),
      );

      const transformed = config.transformRequest?.(requestInit);

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'appium:platformName': 'iOS',
        'tvlabs:session_id': sessionId,
      });
    });

    it('refreshes Content-Length when it rewrites the body', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      const requestInit = sessionRequest(newSessionBody());
      const transformed = config.transformRequest?.(requestInit);

      const headers = transformed?.headers as Headers;

      expect(headers.get('Content-Length')).toEqual(
        `${new TextEncoder().encode(transformed?.body as string).length}`,
      );
    });

    it('creates alwaysMatch when the payload only has firstMatch', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      const body = JSON.stringify({
        capabilities: { firstMatch: [{ 'appium:platformName': 'iOS' }] },
      });

      const transformed = config.transformRequest?.(sessionRequest(body));

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': sessionId,
      });
    });

    it('leaves the body untouched when the session id is already present', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      const body = newSessionBody({ 'tvlabs:session_id': sessionId });
      const requestInit = sessionRequest(body);

      const transformed = config.transformRequest?.(requestInit);

      expect(transformed?.body).toBe(body);
    });

    it('overwrites a session id minted by a different service instance', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      const requestInit = sessionRequest(
        newSessionBody({ 'tvlabs:session_id': 'some-other-session' }),
      );

      const transformed = config.transformRequest?.(requestInit);

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': sessionId,
      });
    });

    it('injects even when attachRequestId is false', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config, {
        apiKey: 'my-api-key',
        attachRequestId: false,
      });

      const transformed = config.transformRequest?.(
        sessionRequest(newSessionBody()),
      );

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': sessionId,
      });
    });

    it('leaves non-session requests untouched', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      const body = JSON.stringify({ using: 'css selector', value: '#button' });
      const transformed = config.transformRequest?.(sessionRequest(body));

      expect(transformed?.body).toBe(body);
    });

    it('leaves the body untouched before beforeSession() has run', () => {
      const config: Options.WebdriverIO = {};

      new TVLabsService({ apiKey: 'my-api-key' }, {}, config);

      const body = newSessionBody({ 'appium:platformName': 'iOS' });
      const transformed = config.transformRequest?.(sessionRequest(body));

      expect(transformed?.body).toBe(body);
    });

    it('keeps the session id for a retried session request', async () => {
      const config: Options.WebdriverIO = {};

      await startedService(config);

      config.transformRequest?.(sessionRequest(newSessionBody()));

      // A caller that retries `remote()` after a failed attempt should
      // reconnect to the session already reserved for it.
      const transformed = config.transformRequest?.(
        sessionRequest(newSessionBody()),
      );

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': sessionId,
      });
    });

    it('clears a previously minted session at the start of beforeSession', async () => {
      const config: Options.WebdriverIO = {};
      const service = await startedService(config);

      // A later mint fails, so no session is reserved for this run. The
      // previous run's id must not leak into the next session request.
      fakeSessionChannel.newSession.mockRejectedValue(
        new SevereServiceError('Could not create a new session.'),
      );

      await expect(service.beforeSession(config, {}, [], '')).rejects.toThrow();

      const body = newSessionBody({ 'appium:platformName': 'iOS' });
      const transformed = config.transformRequest?.(sessionRequest(body));

      expect(transformed?.body).toBe(body);
    });

    it('re-arms after a subsequent beforeSession() mints a new session', async () => {
      const config: Options.WebdriverIO = {};
      const service = await startedService(config);

      config.transformRequest?.(sessionRequest(newSessionBody()));

      const nextSessionId = '6b1f0f0e-6c1a-4a1e-9b3e-2f0d5a7c1e42';
      fakeSessionChannel.newSession.mockResolvedValue(nextSessionId);

      await service.beforeSession(config, {}, [], '');

      const transformed = config.transformRequest?.(
        sessionRequest(newSessionBody()),
      );

      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': nextSessionId,
      });
    });

    describe('session id injection into POST /session (v8 got shape)', () => {
      // v8 hands `transformRequest` a got options object: the payload is a
      // live object on `json`, there is no `body`, headers are a plain object,
      // and a JSONWP copy rides along in `desiredCapabilities`.
      const v8SessionRequest = (payload: unknown): RequestInit => {
        const json = payload as Record<string, unknown>;

        return {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': `${new TextEncoder().encode(JSON.stringify(json)).length}`,
          },
          ...{ json },
        } as RequestInit;
      };

      const jsonOf = (requestInit: RequestInit | undefined) =>
        (requestInit as unknown as { json: NewSessionPayloadShape }).json;

      type NewSessionPayloadShape = {
        capabilities: {
          alwaysMatch: Record<string, unknown>;
          firstMatch: Record<string, unknown>[];
        };
        desiredCapabilities: Record<string, unknown>;
      };

      // v8 aliases `alwaysMatch` and `desiredCapabilities` to one object when
      // the caller passes flat capabilities.
      const v8Payload = (caps: Record<string, unknown> = {}) => ({
        capabilities: { alwaysMatch: caps, firstMatch: [{}] },
        desiredCapabilities: caps,
      });

      it('re-attaches the session id into the got payload', async () => {
        const config: Options.WebdriverIO = {};

        await startedService(config);

        const requestInit = v8SessionRequest(
          v8Payload({ 'appium:platformName': 'iOS' }),
        );

        const transformed = config.transformRequest?.(requestInit);
        const json = jsonOf(transformed);

        expect(json.capabilities.alwaysMatch['tvlabs:session_id']).toEqual(
          sessionId,
        );
        expect(json.desiredCapabilities['tvlabs:session_id']).toEqual(
          sessionId,
        );
      });

      it('mutates the payload in place rather than adding a body', async () => {
        const config: Options.WebdriverIO = {};

        await startedService(config);

        const payload = v8Payload();
        const transformed = config.transformRequest?.(
          v8SessionRequest(payload),
        );

        // `got` serializes `json` on send, so no `body` should be introduced.
        expect(transformed?.body).toBeUndefined();
        expect(payload.capabilities.alwaysMatch).toEqual({
          'tvlabs:session_id': sessionId,
        });
      });

      it('refreshes Content-Length on the plain headers object', async () => {
        const config: Options.WebdriverIO = {};

        await startedService(config);

        const transformed = config.transformRequest?.(
          v8SessionRequest(v8Payload()),
        );

        const headers = transformed?.headers as Record<string, string>;

        expect(headers['Content-Length']).toEqual(
          `${new TextEncoder().encode(JSON.stringify(jsonOf(transformed))).length}`,
        );
      });

      it('keeps the session id for a retried got session request', async () => {
        const config: Options.WebdriverIO = {};

        await startedService(config);

        config.transformRequest?.(v8SessionRequest(v8Payload()));

        const payload = v8Payload({ 'appium:platformName': 'iOS' });
        config.transformRequest?.(v8SessionRequest(payload));

        expect(payload.capabilities.alwaysMatch).toEqual({
          'appium:platformName': 'iOS',
          'tvlabs:session_id': sessionId,
        });
      });

      it('leaves non-session got requests untouched', async () => {
        const config: Options.WebdriverIO = {};

        await startedService(config);

        const payload = { using: 'css selector', value: '#button' };
        config.transformRequest?.(v8SessionRequest(payload));

        expect(payload).toEqual({ using: 'css selector', value: '#button' });
      });
    });

    it('preserves an existing transformRequest', async () => {
      const original = vi.fn((requestOptions: RequestInit) => requestOptions);
      const config: Options.WebdriverIO = { transformRequest: original };

      await startedService(config);

      const transformed = config.transformRequest?.(
        sessionRequest(newSessionBody()),
      );

      expect(original).toHaveBeenCalled();
      expect(bodyOf(transformed).capabilities.alwaysMatch).toEqual({
        'tvlabs:session_id': sessionId,
      });
    });
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
      const service = new TVLabsService({ apiKey: 'my-api-key' }, {}, {});

      await expect(service.disconnect()).resolves.toBeUndefined();
      expect(fakeMetadataChannel.disconnect).not.toHaveBeenCalled();
    });

    it('closes the metadata channel after requestMetadata opened it', async () => {
      const service = new TVLabsService({ apiKey: 'my-api-key' }, {}, {});
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

    it('does not attach a request id when attachRequestId is false', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key', attachRequestId: false };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      const transformed = wdOpts.transformRequest?.({ method: 'GET' });

      expect(transformed?.headers).toBeUndefined();
      expect(service.lastRequestId()).toBeUndefined();
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

      expect(service.rehydratedSessionId).toBe(sessionId);
    });

    it('appiumSessionId getter returns undefined for classic instances', () => {
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const config: Options.WebdriverIO = {};

      const service = new TVLabsService(options, capabilities, config);

      expect(service.rehydratedSessionId).toBeUndefined();
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

    it('disconnect() is a no-op on a rehydrated instance with no open channel', async () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};
      const wdOpts: Options.WebdriverIO = { capabilities };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      await expect(service.disconnect()).resolves.toBeUndefined();
      expect(fakeMetadataChannel.disconnect).not.toHaveBeenCalled();
    });

    it('chains a user-provided transformRequest when attachRequestId is true', () => {
      const sessionId = randomUUID();
      const options = { apiKey: 'my-api-key' };
      const capabilities: TVLabsCapabilities = {};

      const userHeader = 'x-my-header';
      const userHeaderValue = 'my-value';
      const wdOpts: Options.WebdriverIO & {
        transformRequest?: (r: RequestInit) => RequestInit;
      } = {
        capabilities,
        transformRequest: (requestOptions: RequestInit) => ({
          ...requestOptions,
          headers: {
            ...(requestOptions.headers as Record<string, string>),
            [userHeader]: userHeaderValue,
          },
        }),
      };

      const service = TVLabsService.fromSession(sessionId, options, wdOpts);

      // Invoke the installed transformRequest hook
      const result = wdOpts.transformRequest!({} as RequestInit) as {
        headers: Record<string, string>;
      };

      // The user's header must be present (user's transformRequest was called)
      expect(result.headers[userHeader]).toBe(userHeaderValue);

      // The x-request-id header must also be present (TVLabs hook ran)
      expect(result.headers['x-request-id']).toBeDefined();

      // lastRequestId() must match what was injected
      expect(service.lastRequestId()).toBe(result.headers['x-request-id']);
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
