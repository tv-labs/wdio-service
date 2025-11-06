import * as phoenix from 'phoenix';
import { randomUUID, randomInt } from 'crypto';
import { SessionChannel } from '../../src/channels/session.js';
import { SevereServiceError } from 'webdriverio';

const fakeEndpoint = 'ws://localhost:12345';
const fakeApiKey = 'my-api-key';
const reconnectRetries = 5;

vi.mock('phoenix', () => {
  return {
    Socket: vi.fn(function (this: unknown) {
      return fakeSocket;
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockReceive('ok', {});
});

describe('Session Channel', () => {
  it('should be a function', () => {
    expect(SessionChannel).toBeInstanceOf(Function);
  });

  it('can be instantiated', () => {
    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    expect(channel).toBeInstanceOf(SessionChannel);
  });

  it('calls connect and join on connect', async () => {
    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    expect(vi.mocked(phoenix.Socket)).toHaveBeenCalledWith(
      fakeEndpoint,
      expect.objectContaining({
        params: {
          api_key: fakeApiKey,
          service_version: expect.not.stringMatching('unknown'),
          service_name: '@tvlabs/wdio-service',
        },
      }),
    );
    expect(fakeSocket.connect).toHaveBeenCalledOnce();
    expect(fakeChannel.join).toHaveBeenCalled();
  });

  it('can create a new session', async () => {
    const requestId = randomUUID();
    const sessionId = randomUUID();

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', { request_id: requestId });
    mockPushedEvents([
      {
        name: 'session:ready',
        response: { session_id: sessionId, request_id: requestId },
      },
      {
        name: 'request:matching',
        response: { request_id: requestId },
      },
      {
        name: 'request:filled',
        response: { session_id: sessionId, request_id: requestId },
      },
    ]);

    const result = await channel.newSession(
      {
        'tvlabs:constraints': {
          platform_key: 'roku',
        },
        'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
      },
      5,
      0,
    );

    expect(result).toEqual(sessionId);
    expect(fakeChannel.push).toHaveBeenCalledWith(
      'requests:create',
      expect.objectContaining({
        capabilities: {
          'tvlabs:constraints': {
            platform_key: 'roku',
          },
          'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
        },
      }),
    );
  });

  it('raises on failed lobby topic join', async () => {
    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockReceive('error', { response: 'unknown error' });

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on topic join timeout', async () => {
    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockReceive('timeout', {});

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on push timeout', async () => {
    const capabilities = {
      'tvlabs:constraints': {
        platform_key: 'roku',
      },
      'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
    };

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('timeout', {});

    await expect(() => channel.newSession(capabilities, 5, 0)).rejects.toThrow(
      SevereServiceError,
    );
  });

  it('retries on failure to get request id', async () => {
    const retries = randomInt(2, 10);

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('error', { response: 'unknown error' });

    await expect(
      channel.newSession(
        {
          'tvlabs:constraints': {
            platform_key: 'roku',
          },
          'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
        },
        retries,
        0,
      ),
    ).rejects.toThrow(SevereServiceError);

    expect(fakeChannel.push).toHaveBeenCalledTimes(retries + 1);
  });

  it('retries on failed request', async () => {
    const requestId = randomUUID();
    const retries = randomInt(2, 10);

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', { request_id: requestId });
    mockPushedEvents([
      {
        name: 'request:failed',
        response: { request_id: requestId, reason: 'Request failed' },
      },
    ]);

    await expect(
      channel.newSession(
        {
          'tvlabs:constraints': {
            platform_key: 'roku',
          },
          'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
        },
        retries,
        0,
      ),
    ).rejects.toThrow(SevereServiceError);

    expect(fakeChannel.push).toHaveBeenCalledTimes(retries + 1);
  });

  it('retries on failed session', async () => {
    const requestId = randomUUID();
    const sessionId = randomUUID();
    const retries = randomInt(2, 10);

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', { request_id: requestId });
    mockPushedEvents([
      {
        name: 'request:matching',
        response: { request_id: requestId },
      },
      {
        name: 'request:filled',
        response: { session_id: sessionId, request_id: requestId },
      },
      {
        name: 'session:failed',
        response: {
          request_id: requestId,
          session_id: sessionId,
          reason: 'Session failed',
        },
      },
    ]);

    await expect(
      channel.newSession(
        {
          'tvlabs:constraints': {
            platform_key: 'roku',
          },
          'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
        },
        retries,
        0,
      ),
    ).rejects.toThrow(SevereServiceError);

    expect(fakeChannel.push).toHaveBeenCalledTimes(retries + 1);
  });

  it('retries on canceled request', async () => {
    const requestId = randomUUID();
    const retries = randomInt(2, 10);

    const channel = new SessionChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', { request_id: requestId });
    mockPushedEvents([
      {
        name: 'request:canceled',
        response: { request_id: requestId, reason: 'Request canceled' },
      },
    ]);

    await expect(
      channel.newSession(
        {
          'tvlabs:constraints': {
            platform_key: 'roku',
          },
          'tvlabs:build': '6277d0d7-71de-4f72-9427-aaaf831e0122',
        },
        retries,
        0,
      ),
    ).rejects.toThrow(SevereServiceError);

    expect(fakeChannel.push).toHaveBeenCalledTimes(retries + 1);
  });
});

const fakeChannel = {
  join: vi.fn().mockReturnThis(),
  push: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  leave: vi.fn().mockReturnThis(),
  receive: vi.fn().mockImplementation((event, callback) => {
    if (event === 'ok') {
      callback({});
    }

    return this;
  }),
};

const fakeSocket = {
  connect: vi.fn(),
  channel: vi.fn(() => fakeChannel),
  onError: vi.fn(),
};

function mockReceive(event: string, response: object) {
  fakeChannel.receive.mockImplementation((e, callback) => {
    if (e === event) {
      callback(response);
    }

    return fakeChannel;
  });
}

function mockPushedEvents(
  mockedEvents: Array<{ name: string; response: object }>,
) {
  fakeChannel.on.mockImplementation((name, handler) => {
    const mock = mockedEvents.find((e) => e.name === name);

    if (mock) {
      handler(mock.response);
    }

    return fakeChannel;
  });
}
