import { apiRequest } from './client.js';
import type { ApiContext, DeviceIOSessionMetadataResponse } from '../types.js';

export async function getSessionMetadata(
  context: ApiContext,
  sessionId: string,
): Promise<DeviceIOSessionMetadataResponse> {
  return apiRequest<DeviceIOSessionMetadataResponse>(
    context,
    `/api/v1/sessions/appium/${sessionId}`,
  );
}
