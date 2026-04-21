import { Logger } from '../logger.js';
import type { ApiContext, ApiRequestOptions } from '../types.js';

export async function apiRequest<T>(
  context: ApiContext,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const log = new Logger('@tvlabs/api-client', context.logLevel ?? 'info');
  const url = `${context.baseUrl}${path}`;
  const method = options.method ?? 'GET';

  log.debug(`${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${context.apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    log.error(`API request failed: ${response.status} ${text}`);
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}
