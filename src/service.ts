import { SevereServiceError } from 'webdriverio';
import * as crypto from 'crypto';
import { getServiceVersion } from './utils.js';

import { SessionChannel } from './channels/session.js';
import { BuildChannel } from './channels/build.js';
import { MetadataChannel } from './channels/metadata.js';
import { Logger } from './logger.js';

import type { Services, Capabilities, Options } from '@wdio/types';
import type {
  TVLabsCapabilities,
  TVLabsServiceOptions,
  TVLabsRequestMetadata,
  TVLabsRequestMetadataResponse,
  LogLevel,
} from './types.js';

export default class TVLabsService implements Services.ServiceInstance {
  private log: Logger;
  private requestId: string | undefined;
  private sessionId: string | undefined;
  private metadataChannel: MetadataChannel | undefined;

  constructor(
    private _options: TVLabsServiceOptions,
    private _capabilities: Capabilities.ResolvedTestrunnerCapabilities,
    private _config: Options.WebdriverIO,
  ) {
    this.log = new Logger('@tvlabs/wdio-service', this._config.logLevel);

    this.injectAuthorizationHeader();

    if (this.attachRequestId()) {
      this.setupRequestId();
    }

    this.log.info(`Instantiated TVLabsService v${getServiceVersion()}`);
  }

  lastRequestId(): string | undefined {
    return this.requestId;
  }

  async requestMetadata(
    sessionId: string,
    requestIds: string | string[],
  ): Promise<TVLabsRequestMetadata | TVLabsRequestMetadataResponse> {
    const requestIdArray = Array.isArray(requestIds)
      ? requestIds
      : [requestIds];

    // Create and connect to metadata channel if not already connected
    if (!this.metadataChannel) {
      this.metadataChannel = new MetadataChannel(
        this.sessionEndpoint(),
        this.reconnectRetries(),
        this.apiKey(),
        this.logLevel(),
      );

      await this.metadataChannel.connect();
    }

    const response = await this.metadataChannel.getRequestMetadata(
      sessionId,
      requestIdArray,
    );

    // If a single request ID was passed, return just that request's metadata
    if (!Array.isArray(requestIds)) {
      return response[requestIds];
    }

    // Otherwise return the full map
    return response;
  }

  onPrepare(
    _config: Options.Testrunner,
    param: Capabilities.TestrunnerCapabilities,
  ) {
    try {
      if (!Array.isArray(param)) {
        throw new SevereServiceError(
          'Multi-remote capabilities are not implemented. Contact TV Labs support if you are interested in this feature.',
        );
      }
    } catch (error) {
      if (!this.continueOnError()) {
        process.exit(1);
      }

      throw error;
    }
  }

  async beforeSession(
    _config: Omit<Options.Testrunner, 'capabilities'>,
    capabilities: TVLabsCapabilities,
    _specs: string[],
    _cid: string,
  ) {
    try {
      const buildPath = this.buildPath();

      if (buildPath) {
        const buildChannel = new BuildChannel(
          this.buildEndpoint(),
          this.reconnectRetries(),
          this.apiKey(),
          this.logLevel(),
        );

        await buildChannel.connect();

        capabilities['tvlabs:build'] = await buildChannel.uploadBuild(
          buildPath,
          this.appSlug(),
        );

        await buildChannel.disconnect();
      }

      const sessionChannel = new SessionChannel(
        this.sessionEndpoint(),
        this.reconnectRetries(),
        this.apiKey(),
        this.logLevel(),
      );

      await sessionChannel.connect();

      capabilities['tvlabs:session_id'] = await sessionChannel.newSession(
        capabilities,
        this.retries(),
      );

      await sessionChannel.disconnect();
    } catch (error) {
      if (!this.continueOnError()) {
        process.exit(1);
      }

      throw error;
    }
  }

  private injectAuthorizationHeader() {
    this._config.headers = this._config.headers || {};

    if (!this._config.headers.Authorization) {
      this._config.headers.Authorization = `Bearer ${this.apiKey()}`;
    }
  }

  private setupRequestId() {
    const originalTransformRequest = this._config.transformRequest;

    this._config.transformRequest = (requestOptions: RequestInit) => {
      const requestId = crypto.randomUUID();
      const originalRequestOptions =
        typeof originalTransformRequest === 'function'
          ? originalTransformRequest(requestOptions)
          : requestOptions;

      if (typeof originalRequestOptions.headers === 'undefined') {
        originalRequestOptions.headers = <HeadersInit>{};
      }

      this.setRequestHeader(
        originalRequestOptions.headers,
        'x-request-id',
        requestId,
      );

      this.log.debug('ATTACHED REQUEST ID', requestId);

      this.setRequestId(requestId);

      return originalRequestOptions;
    };
  }

  private setRequestHeader(
    headers: RequestInit['headers'],
    header: string,
    value: string,
  ) {
    if (headers instanceof Headers) {
      headers.set(header, value);
    } else if (typeof headers === 'object') {
      if (Array.isArray(headers)) {
        headers.push([header, value]);
      } else {
        headers[header] = value;
      }
    }
  }

  private setRequestId(id: string) {
    this.requestId = id;
  }

  private continueOnError(): boolean {
    return this._options.continueOnError ?? false;
  }

  private buildPath(): string | undefined {
    return this._options.buildPath;
  }

  private appSlug(): string | undefined {
    return this._options.app;
  }

  private sessionEndpoint(): string {
    return this._options.sessionEndpoint ?? 'wss://tvlabs.ai/appium';
  }

  private buildEndpoint(): string {
    return this._options.buildEndpoint ?? 'wss://tvlabs.ai/cli';
  }

  private retries(): number {
    return this._options.retries ?? 3;
  }

  private apiKey(): string {
    return this._options.apiKey;
  }

  private logLevel(): LogLevel {
    return this._config.logLevel ?? 'info';
  }

  private attachRequestId(): boolean {
    return this._options.attachRequestId ?? true;
  }

  private reconnectRetries(): number {
    return this._options.reconnectRetries ?? 5;
  }
}
