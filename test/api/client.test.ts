import { apiRequest } from '../../src/api/client.js';
import type { ApiContext } from '../../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const context: ApiContext = {
  baseUrl: 'https://www.tvlabs.ai',
  apiKey: 'test-api-key',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('apiRequest', () => {
  it('makes a GET request by default', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });

    await apiRequest(context, '/api/v1/test');

    expect(mockFetch).toHaveBeenCalledWith('https://www.tvlabs.ai/api/v1/test', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('returns parsed JSON response', async () => {
    const mockData = { id: '123', name: 'test-session' };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await apiRequest(context, '/api/v1/test');

    expect(result).toEqual(mockData);
  });

  it('supports custom HTTP methods', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest(context, '/api/v1/test', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('serializes and sends a JSON body when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const body = { key: 'value' };

    await apiRequest(context, '/api/v1/test', { method: 'POST', body });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(body) }),
    );
  });

  it('does not include body when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest(context, '/api/v1/test');

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.body).toBeUndefined();
  });

  it('merges custom headers with default headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiRequest(context, '/api/v1/test', {
      headers: { 'X-Custom': 'custom-value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'X-Custom': 'custom-value',
        },
      }),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Resource not found'),
    });

    await expect(apiRequest(context, '/api/v1/test')).rejects.toThrow(
      'API request failed: 404 Not Found',
    );
  });

  it('throws on server error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Something went wrong'),
    });

    await expect(apiRequest(context, '/api/v1/test')).rejects.toThrow(
      'API request failed: 500 Internal Server Error',
    );
  });
});
