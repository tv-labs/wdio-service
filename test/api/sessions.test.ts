import { randomUUID } from 'crypto';
import { getSessionMetadata } from '../../src/api/sessions.js';
import { apiRequest } from '../../src/api/client.js';
import type { ApiContext } from '../../src/types.js';

vi.mock('../../src/api/client', () => {
  return {
    apiRequest: vi.fn(),
  };
});

const context: ApiContext = {
  baseUrl: 'https://www.tvlabs.ai',
  apiKey: 'test-api-key',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSessionMetadata', () => {
  it('calls apiRequest with the correct path', async () => {
    const sessionId = randomUUID();
    const mockResponse = { id: sessionId, status: 'completed' };

    vi.mocked(apiRequest).mockResolvedValue(mockResponse);

    const result = await getSessionMetadata(context, sessionId);

    expect(apiRequest).toHaveBeenCalledWith(
      context,
      `/api/v1/sessions/appium/${sessionId}`,
    );
    expect(result).toEqual(mockResponse);
  });

  it('passes the context through to apiRequest', async () => {
    const sessionId = randomUUID();
    const customContext: ApiContext = {
      baseUrl: 'https://custom.tvlabs.ai',
      apiKey: 'custom-key',
      logLevel: 'debug',
    };

    vi.mocked(apiRequest).mockResolvedValue({});

    await getSessionMetadata(customContext, sessionId);

    expect(apiRequest).toHaveBeenCalledWith(customContext, expect.any(String));
  });

  it('propagates errors from apiRequest', async () => {
    const sessionId = randomUUID();

    vi.mocked(apiRequest).mockRejectedValue(
      new Error('API request failed: 401 Unauthorized'),
    );

    await expect(getSessionMetadata(context, sessionId)).rejects.toThrow(
      'API request failed: 401 Unauthorized',
    );
  });
});
