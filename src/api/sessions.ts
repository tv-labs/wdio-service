import { apiRequest } from './client.js';
import type { ApiContext, TVLabsSessionMetadataResponse } from '../types.js';

export async function getSessionMetadata(
  context: ApiContext,
  sessionId: string,
): Promise<TVLabsSessionMetadataResponse> {
  return apiRequest<TVLabsSessionMetadataResponse>(
    context,
    `/api/v1/sessions/appium/${sessionId}`,
  );
}
