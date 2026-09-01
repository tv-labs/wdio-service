import type { Capabilities } from '@wdio/types';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type TVLabsServiceOptions = {
  apiKey: string;
  sessionEndpoint?: string;
  buildEndpoint?: string;
  apiBaseUrl?: string;
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

/**
 * The body of a WebDriver `POST /session` request.
 *
 * WebdriverIO v8 sends a JSONWP-compliant copy of the capabilities alongside
 * the W3C payload; v9 sends the W3C payload only.
 */
export type WebdriverSessionCreatePayload = {
  capabilities: {
    alwaysMatch?: Record<string, unknown>;
    firstMatch?: Record<string, unknown>[];
  };
  desiredCapabilities?: Record<string, unknown>;
};

/**
 * The request options handed to a WebdriverIO `transformRequest` hook.
 *
 * WebdriverIO v9 issues requests through `fetch`, so the payload arrives
 * serialized on `body`. v8 issues them through `got`, which takes the payload
 * as an object on `json`. The service supports both.
 */
export type WebdriverTransformableRequest = RequestInit & { json?: unknown };

export type TVLabsSessionRequestEventHandler = (
  response: TVLabsSessionRequestUpdate,
) => void;

export type TVLabsSessionRequestUpdate = {
  request_id: string;
  session_id: string;
  reason: string;
};

export type ResponseAnyValue =
  | string
  | number
  | boolean
  | null
  | ResponseAnyValue[]
  | { [key: string]: ResponseAnyValue };

export type TVLabsSessionRequestResponse = {
  status: number;
  path: string;
  request_id: string;
  method: string;
  req_body: ResponseAnyValue;
  resp_body: ResponseAnyValue;
  requested_at: string | null;
  responded_at: string | null;
  video_start_time: number | null;
  video_end_time: number | null;
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

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiContext = {
  baseUrl: string;
  apiKey: string;
  logLevel?: LogLevel;
};

export type TVLabsSessionMetadataResponse = {
  data: {
    id: string;
    type: TVLabsSessionType;
    status: string;
    team_id: string;
    start_time: string;
    duration: number;
    end_time: string;
    organization_id: string;
    appium: {
      session_id: string;
    } | null;
    application: {
      id: string;
      name: string;
      version: string;
    } | null;
    device: {
      description: string;
      make: {
        display_name: string;
      };
      model: {
        display_name: string;
        year: number;
      };
      platform: {
        key: string;
        name: string;
      };
      unit_id: string;
      type: TVLabsDeviceType;
    } | null;
    recording: {
      duration: number;
      start_time: string;
      end_time: string;
      hls_playlist_url: string;
      player_url: string;
    } | null;
    teleport: {
      region: {
        country_name: string;
        locale_name: string;
        slug: string;
      };
    } | null;
    http_archives: Array<{
      id: string;
      name: string;
      size: string;
      created_at: string;
    }>;
  };
};

export type TVLabsRequestMetadata = {
  status: number;
  path: string;
  method: HTTPMethod;
  request_id: string;
  req_body: unknown;
  resp_body: unknown;
  requested_at: string;
  responded_at: string;
  video_end_time: number;
  video_start_time: number;
};

export type HTTPMethod =
  | 'post'
  | 'get'
  | 'delete'
  | 'patch'
  | 'put'
  | 'head'
  | 'options';

export type TVLabsSessionType = 'appium' | 'user' | 'automation';
export type TVLabsDeviceType = 'tv' | 'stb' | 'mobile' | 'browser';

export type TVLabsRequestMetadataResponse = {
  [request_id: string]: TVLabsRequestMetadata;
};
