import type { Capabilities } from '@wdio/types';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type DeviceIOServiceOptions = {
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

type LegacyCapabilityKeys = {
  session_id: string;
  build: string;
  constraints: Record<string, unknown> | string;
  match_timeout: number;
  device_timeout: number;
};

export type DeviceIOCapabilities =
  Capabilities.RequestedStandaloneCapabilities & {
    'device:session_id'?: string;
    'device:build'?: string;
    'device:constraints'?: {
      platform_key?: string;
      device_type?: string;
      make?: string;
      model?: string;
      year?: string;
      minimum_chromedriver_major_version?: number;
      supports_chromedriver?: boolean;
    };
    'device:match_timeout'?: number;
    'device:device_timeout'?: number;
  } & {
    /** @deprecated Legacy `tvlabs:*` prefix, use the `device:*` equivalent. */
    [K in keyof LegacyCapabilityKeys as `tvlabs:${K}`]?: LegacyCapabilityKeys[K];
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

export type DeviceIOSessionRequestEventHandler = (
  response: DeviceIOSessionRequestUpdate,
) => void;

export type DeviceIOSessionRequestUpdate = {
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

export type DeviceIOSessionRequestResponse = {
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

export type DeviceIOSocketParams = DeviceIOServiceInfo & {
  api_key: string;
};

export type DeviceIOServiceInfo = {
  service_version: string;
  service_name: string;
};

export type DeviceIORequestUploadUrlResponse = {
  url: string;
  build_id: string;
  existing: boolean;
  application_id?: string;
};

export type DeviceIOExtractBuildInfoResponse = {
  application_id: string;
};

export type DeviceIOBuildMetadata = {
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

export type DeviceIOSessionMetadataResponse = {
  data: {
    id: string;
    type: DeviceIOSessionType;
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
      type: DeviceIODeviceType;
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

export type DeviceIORequestMetadata = {
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

export type DeviceIOSessionType = 'appium' | 'user' | 'automation';
export type DeviceIODeviceType = 'tv' | 'stb' | 'mobile' | 'browser';

export type DeviceIORequestMetadataResponse = {
  [request_id: string]: DeviceIORequestMetadata;
};

/**
 * Deprecated `TVLabs*` aliases for the `DeviceIO*` types above. They exist so
 * existing consumers keep compiling and will be removed in the next major
 * release.
 */

/** @deprecated Use `DeviceIOServiceOptions`. */
export type TVLabsServiceOptions = DeviceIOServiceOptions;

/** @deprecated Use `DeviceIOCapabilities`. */
export type TVLabsCapabilities = DeviceIOCapabilities;

/** @deprecated Use `DeviceIOSessionRequestEventHandler`. */
export type TVLabsSessionRequestEventHandler =
  DeviceIOSessionRequestEventHandler;

/** @deprecated Use `DeviceIOSessionRequestUpdate`. */
export type TVLabsSessionRequestUpdate = DeviceIOSessionRequestUpdate;

/** @deprecated Use `DeviceIOSessionRequestResponse`. */
export type TVLabsSessionRequestResponse = DeviceIOSessionRequestResponse;

/** @deprecated Use `DeviceIOSocketParams`. */
export type TVLabsSocketParams = DeviceIOSocketParams;

/** @deprecated Use `DeviceIOServiceInfo`. */
export type TVLabsServiceInfo = DeviceIOServiceInfo;

/** @deprecated Use `DeviceIORequestUploadUrlResponse`. */
export type TVLabsRequestUploadUrlResponse = DeviceIORequestUploadUrlResponse;

/** @deprecated Use `DeviceIOExtractBuildInfoResponse`. */
export type TVLabsExtractBuildInfoResponse = DeviceIOExtractBuildInfoResponse;

/** @deprecated Use `DeviceIOBuildMetadata`. */
export type TVLabsBuildMetadata = DeviceIOBuildMetadata;

/** @deprecated Use `DeviceIOSessionMetadataResponse`. */
export type TVLabsSessionMetadataResponse = DeviceIOSessionMetadataResponse;

/** @deprecated Use `DeviceIORequestMetadata`. */
export type TVLabsRequestMetadata = DeviceIORequestMetadata;

/** @deprecated Use `DeviceIOSessionType`. */
export type TVLabsSessionType = DeviceIOSessionType;

/** @deprecated Use `DeviceIODeviceType`. */
export type TVLabsDeviceType = DeviceIODeviceType;

/** @deprecated Use `DeviceIORequestMetadataResponse`. */
export type TVLabsRequestMetadataResponse = DeviceIORequestMetadataResponse;
