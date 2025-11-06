import * as phoenix from 'phoenix';
import { randomUUID } from 'crypto';
import { MetadataChannel } from '../../src/channels/metadata.js';
import { SevereServiceError } from 'webdriverio';

const fakeEndpoint = 'ws://localhost:12345';
const fakeApiKey = 'my-api-key';
const reconnectRetries = 5;

vi.mock('phoenix', () => {
  return {
    Socket: vi.fn(function(this: unknown) {
      return fakeSocket;
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockReceive('ok', {});
});

describe('Metadata Channel', () => {
  it('should be a function', () => {
    expect(MetadataChannel).toBeInstanceOf(Function);
  });

  it('can be instantiated', () => {
    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    expect(channel).toBeInstanceOf(MetadataChannel);
  });

  it('calls connect and join on connect', async () => {
    const channel = new MetadataChannel(
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

  it('can fetch metadata for a single request', async () => {
    const sessionId = randomUUID();
    const requestId = randomUUID();
    const mockMetadata = {
      path: '/session/123/element',
      method: 'POST',
      status: 200,
      request_id: requestId,
      resp_body: { value: 'element-123' },
    };

    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', {
      [requestId]: mockMetadata,
    });

    const result = await channel.getRequestMetadata(sessionId, [requestId]);

    expect(result).toEqual({
      [requestId]: mockMetadata,
    });
    expect(fakeChannel.push).toHaveBeenCalledWith('appium_request_metadata', {
      appium_session_id: sessionId,
      request_ids: [requestId],
    });
  });

  it('can fetch metadata for multiple requests', async () => {
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

    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('ok', mockMetadataResponse);

    const result = await channel.getRequestMetadata(sessionId, [
      requestId1,
      requestId2,
    ]);

    expect(result).toEqual(mockMetadataResponse);
    expect(fakeChannel.push).toHaveBeenCalledWith('appium_request_metadata', {
      appium_session_id: sessionId,
      request_ids: [requestId1, requestId2],
    });
  });

  it('raises on failed lobby topic join', async () => {
    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockReceive('error', { response: 'unknown error' });

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on topic join timeout', async () => {
    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockReceive('timeout', {});

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on push timeout', async () => {
    const sessionId = randomUUID();
    const requestId = randomUUID();

    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('timeout', {});

    await expect(() =>
      channel.getRequestMetadata(sessionId, [requestId]),
    ).rejects.toThrow();
  });

  it('raises on push error', async () => {
    const sessionId = randomUUID();
    const requestId = randomUUID();

    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();

    mockReceive('error', { response: 'unknown error' });

    await expect(() =>
      channel.getRequestMetadata(sessionId, [requestId]),
    ).rejects.toThrow();
  });

  it('can disconnect', async () => {
    const channel = new MetadataChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    await channel.connect();
    await channel.disconnect();

    expect(fakeChannel.leave).toHaveBeenCalled();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });
});

function mockReceive(status: string, response: unknown) {
  const receiveImpl = (s: string, callback: (r: unknown) => void) => {
    if (s === status) {
      setTimeout(() => callback(response), 0);
    }

    return {
      receive: receiveImpl,
    };
  };

  fakeChannel.push.mockReturnValue({
    receive: receiveImpl,
  });

  fakeChannel.join.mockReturnValue({
    receive: receiveImpl,
  });
}

const fakeChannel = {
  push: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

const fakeSocket = {
  channel: vi.fn().mockReturnValue(fakeChannel),
  connect: vi.fn(),
  disconnect: vi.fn((callback: () => void) => {
    if (callback) setTimeout(callback, 0);
  }),
  onError: vi.fn(),
};
