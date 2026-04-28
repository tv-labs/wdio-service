import { SevereServiceError } from 'webdriverio';
import * as crypto from 'crypto';
import { getServiceVersion } from './utils.js';

import { SessionChannel } from './channels/session.js';
import { BuildChannel } from './channels/build.js';
import { MetadataChannel } from './channels/metadata.js';
import { getSessionMetadata } from './api/sessions.js';
import { Logger } from './logger.js';

import type { Services, Capabilities, Options } from '@wdio/types';
import type {
  TVLabsCapabilities,
  TVLabsServiceOptions,
  TVLabsRequestMetadata,
  TVLabsRequestMetadataResponse,
  TVLabsSessionMetadataResponse,
  LogLevel,
} from './types.js';

export default class TVLabsService implements Services.ServiceInstance {
  private log: Logger;
  private requestId: string | undefined;
  private metadataChannel: MetadataChannel | undefined;
  private _sessionId: string | undefined;
  private _rehydrated: boolean = false;

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

  /**
   * Creates a TVLabsService instance bound to an existing session.
   *
   * Use this in a consumer repo that receives a `sessionId` from a session
   * creator. The returned service supports `lastRequestId()`,
   * `requestMetadata()`, and `sessionMetadata()` without calling
   * `beforeSession()`.
   *
   * **Important:** `wdOpts` must be the same reference later passed to
   * `remote()`. The factory mutates it to inject the authorization header,
   * request-id tracking hook, and `tvlabs:session_id` capability.
   *
   * @param sessionId - The TV Labs session ID obtained from the session creator.
   * @param options - Service options. Pass `validate: true` to eagerly verify the session exists.
   * @param wdOpts - WebdriverIO remote options. Must be the same reference passed to `remote()`.
   */
  static fromSession(
    sessionId: string,
    options: TVLabsServiceOptions & { validate: true },
    wdOpts: Options.WebdriverIO & { capabilities?: unknown },
  ): Promise<TVLabsService>;
  static fromSession(
    sessionId: string,
    options: TVLabsServiceOptions,
    wdOpts: Options.WebdriverIO & { capabilities?: unknown },
  ): TVLabsService;
  static fromSession(
    sessionId: string,
    options: TVLabsServiceOptions,
    wdOpts: Options.WebdriverIO & { capabilities?: unknown },
  ): TVLabsService | Promise<TVLabsService> {
    if (
      !wdOpts.capabilities ||
      typeof wdOpts.capabilities !== 'object' ||
      Array.isArray(wdOpts.capabilities)
    ) {
      throw new SevereServiceError(
        'wdOpts.capabilities must be a capabilities object. Multi-remote capabilities are not supported.',
      );
    }

    const capabilities = wdOpts.capabilities as TVLabsCapabilities;
    const service = new TVLabsService(
      options,
      capabilities as Capabilities.ResolvedTestrunnerCapabilities,
      wdOpts as Options.WebdriverIO,
    );

    service._rehydrated = true;
    service._sessionId = sessionId;
    capabilities['tvlabs:session_id'] = sessionId;

    if (options.validate) {
      return getSessionMetadata(
        {
          baseUrl: service.apiBaseUrl(),
          apiKey: service.apiKey(),
          logLevel: service.logLevel(),
        },
        sessionId,
      )
        .then(() => service)
        .catch((error) => {
          throw new SevereServiceError(
            `Cannot rehydrate: session ${sessionId} not found or inaccessible. ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

    return service;
  }

  /**
   * Returns the session ID bound via `fromSession()`, or `undefined`
   * for service instances created through the standard constructor.
   */
  get sessionId(): string | undefined {
    return this._sessionId;
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

  async sessionMetadata(
    sessionId: string,
  ): Promise<TVLabsSessionMetadataResponse> {
    return getSessionMetadata(
      {
        baseUrl: this.apiBaseUrl(),
        apiKey: this.apiKey(),
        logLevel: this.logLevel(),
      },
      sessionId,
    );
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
    if (this._rehydrated) {
      throw new SevereServiceError(
        'beforeSession() is not valid on a rehydrated service. The session was supplied to fromSession() and should not be recreated.',
      );
    }

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

  private apiBaseUrl(): string {
    return this._options.apiBaseUrl ?? 'https://www.tvlabs.ai';
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
