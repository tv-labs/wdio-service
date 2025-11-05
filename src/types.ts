import type { Capabilities } from '@wdio/types';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type TVLabsServiceOptions = {
  apiKey: string;
  sessionEndpoint?: string;
  buildEndpoint?: string;
  retries?: number;
  buildPath?: string;
  app?: string;
  reconnectRetries?: number;
  attachRequestId?: boolean;
  continueOnError?: boolean;
};

export type TVLabsCapabilities =
  Capabilities.RequestedStandaloneCapabilities & {
    'tvlabs:session_id'?: string;
    'tvlabs:build'?: string;
    'tvlabs:constraints'?: {
      platform_key?: string;
      device_type?: string;
      make?: string;
      model?: string;
      year?: string;
      minimum_chromedriver_major_version?: number;
      supports_chromedriver?: boolean;
    };
    'tvlabs:match_timeout'?: number;
    'tvlabs:device_timeout'?: number;
  };

export type TVLabsSessionRequestEventHandler = (
  response: TVLabsSessionRequestUpdate,
) => void;

export type TVLabsSessionRequestUpdate = {
  request_id: string;
  session_id: string;
  reason: string;
};

export type TVLabsSessionRequestResponse = {
  request_id: string;
};

export type TVLabsSocketParams = TVLabsServiceInfo & {
  api_key: string;
};

export type TVLabsServiceInfo = {
  service_version: string;
  service_name: string;
};

export type TVLabsRequestUploadUrlResponse = {
  url: string;
  build_id: string;
  existing: boolean;
  application_id?: string;
};

export type TVLabsExtractBuildInfoResponse = {
  application_id: string;
};

export type TVLabsBuildMetadata = {
  filename: string;
  type: string;
  size: number;
  sha256: string;
};

export type TVLabsRequestMetadata = {
  [key: string]: unknown;
};

export type TVLabsRequestMetadataResponse = {
  [request_id: string]: TVLabsRequestMetadata;
};
