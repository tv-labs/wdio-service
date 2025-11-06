import * as phoenix from 'phoenix';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { BuildChannel } from '../../src/channels/build.js';
import { SevereServiceError } from 'webdriverio';

const fakeEndpoint = 'ws://localhost:12345';
const fakeApiKey = 'my-api-key';
const reconnectRetries = 5;
const testBuildPath = '/path/to/test.apk';
const testAppSlug = 'test-app';

const mockFileData = crypto.randomBytes(1024);
const mockFileHash = crypto
  .createHash('sha256')
  .update(mockFileData)
  .digest('hex');

vi.stubGlobal('fetch', vi.fn());

vi.mock('phoenix', () => {
  return {
    Socket: vi.fn(function (this: unknown) {
      return fakeSocket;
    }),
  };
});

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  createReadStream: vi.fn().mockImplementation(() => ({
    pipe: vi.fn(),
    on: vi.fn().mockImplementation((event, callback) => {
      callback(event === 'data' ? Buffer.from(mockFileData) : undefined);
    }),
    read: vi.fn(),
  })),
}));

vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats);

vi.mocked(fetch).mockResolvedValue({
  ok: true,
  status: 200,
} as Response);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Build Channel', () => {
  it('should be a function', () => {
    expect(BuildChannel).toBeInstanceOf(Function);
  });

  it('can be instantiated', () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    expect(channel).toBeInstanceOf(BuildChannel);
  });

  it('calls connect and join on connect', async () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

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

  it('can upload a build successfully', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response
    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Extract build info response
    mockPushReceive('ok', { application_id: applicationId });

    const result = await channel.uploadBuild(testBuildPath, testAppSlug);

    expect(result).toEqual(buildId);

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: {
          filename: 'test.apk',
          type: 'application/vnd.android.package-archive',
          size: 1024,
          sha256: mockFileHash,
        },
        application_slug: testAppSlug,
      }),
    );

    expect(fetch).toHaveBeenCalledWith(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': '1024',
      },
      body: expect.any(Object),
      duplex: 'half',
    });

    expect(fakeChannel.push).toHaveBeenCalledWith('extract_build_info', {});
  });

  it('can upload a build without app slug', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response
    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Extract build info response
    mockPushReceive('ok', { application_id: applicationId });

    const result = await channel.uploadBuild(testBuildPath);

    expect(result).toEqual(buildId);

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: {
          filename: 'test.apk',
          type: 'application/vnd.android.package-archive',
          size: 1024,
          sha256: mockFileHash,
        },
        application_slug: undefined,
      }),
    );

    expect(fetch).toHaveBeenCalledWith(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': '1024',
      },
      body: expect.any(Object),
      duplex: 'half',
    });

    expect(fakeChannel.push).toHaveBeenCalledWith('extract_build_info', {});
  });

  it('skips upload when existing build is returned from lobby', async () => {
    const buildId = crypto.randomUUID();
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response with existing=true
    mockPushReceive('ok', {
      url: null,
      build_id: buildId,
      existing: true,
      application_id: applicationId,
    });

    const result = await channel.uploadBuild(testBuildPath, testAppSlug);

    expect(result).toEqual(buildId);

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: {
          filename: 'test.apk',
          type: 'application/vnd.android.package-archive',
          size: 1024,
          sha256: mockFileHash,
        },
        application_slug: testAppSlug,
      }),
    );

    // Ensure no upload (fetch) and no extract call happened
    expect(fetch).not.toHaveBeenCalled();
    expect(fakeChannel.push).not.toHaveBeenCalledWith('extract_build_info', {});
  });

  it('detects correct MIME type for zip files', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response
    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Extract build info response
    mockPushReceive('ok', { application_id: applicationId });

    await channel.uploadBuild('/path/to/test.zip');

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: expect.objectContaining({
          filename: 'test.zip',
          type: 'application/zip',
          size: 1024,
          sha256: mockFileHash,
        }),
      }),
    );
  });

  it('detects correct MIME type for apk files', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response
    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Extract build info response
    mockPushReceive('ok', { application_id: applicationId });

    await channel.uploadBuild('/path/to/test.apk');

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: expect.objectContaining({
          filename: 'test.apk',
          type: 'application/vnd.android.package-archive',
          size: 1024,
          sha256: mockFileHash,
        }),
      }),
    );
  });

  it('detects correct MIME type for other file types', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';
    const applicationId = 'com.example.app';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    // Request upload URL response
    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Extract build info response
    mockPushReceive('ok', { application_id: applicationId });

    await channel.uploadBuild('/path/to/test.unknown');

    expect(fakeChannel.push).toHaveBeenCalledWith(
      'request_upload_url',
      expect.objectContaining({
        metadata: expect.objectContaining({
          filename: 'test.unknown',
          type: 'application/octet-stream',
          size: 1024,
          sha256: mockFileHash,
        }),
      }),
    );
  });

  it('raises on failed lobby topic join', async () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('error', { response: 'unknown error' });

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on topic join timeout', async () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('timeout', {});

    await expect(() => channel.connect()).rejects.toThrow(SevereServiceError);
  });

  it('raises on upload URL request timeout', async () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('timeout', {});

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow();
  });

  it('raises on upload URL request error', async () => {
    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('error', { reason: 'Mock error' });

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow();
  });

  it('raises on failed file upload to storage', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    // Mock failed upload
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow(
      SevereServiceError,
    );
  });

  it('raises on extract build info timeout', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });
    mockPushReceive('timeout', {});

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow();
  });

  it('raises on extract build info error', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });
    mockPushReceive('error', { reason: 'Mock error' });

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow();
  });

  it('raises on fetch network error', async () => {
    const buildId = crypto.randomUUID();
    const uploadUrl = 'https://storage.example.com/upload';

    const channel = new BuildChannel(
      fakeEndpoint,
      reconnectRetries,
      fakeApiKey,
    );

    mockJoinReceive('ok', {});

    await channel.connect();

    mockPushReceive('ok', { url: uploadUrl, build_id: buildId });

    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    await expect(() => channel.uploadBuild(testBuildPath)).rejects.toThrow();
  });
});

const fakeChannel = {
  join: vi.fn().mockReturnThis(),
  push: vi.fn().mockReturnThis(),
  leave: vi.fn().mockReturnThis(),
  receive: vi.fn().mockImplementation((event, callback) => {
    if (event === 'ok') {
      callback({});
    }
    return fakeChannel;
  }),
};

const fakeSocket = {
  connect: vi.fn(),
  channel: vi.fn(() => fakeChannel),
  onError: vi.fn(),
  disconnect: vi.fn((callback?: () => void) => callback?.()),
};

function mockJoinReceive(event: string, response: object) {
  fakeChannel.receive.mockImplementation((e, callback) => {
    if (e === event) {
      callback(response);
    }
    return fakeChannel;
  });
}

function mockPushReceive(event: string, response: object) {
  const mockReceiveChain = {
    receive: vi.fn().mockImplementation((type, callback) => {
      if (type === event) {
        callback(response);
      }
      return mockReceiveChain;
    }),
  };

  fakeChannel.push.mockImplementationOnce((_event) => {
    return mockReceiveChain;
  });
}
