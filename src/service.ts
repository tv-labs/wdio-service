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
  WebdriverSessionCreatePayload,
  WebdriverTransformableRequest,
  LogLevel,
} from './types.js';

const TVLABS_SESSION_ID_CAPABILITY = 'tvlabs:session_id';

export default class TVLabsService implements Services.ServiceInstance {
  private log: Logger;
  private requestId: string | undefined;
  private metadataChannel: MetadataChannel | undefined;
  private _rehydratedSessionId: string | undefined;
  private platformSessionId: string | undefined;

  constructor(
    private _options: TVLabsServiceOptions,
    private _capabilities: Capabilities.ResolvedTestrunnerCapabilities,
    private _config: Options.WebdriverIO,
  ) {
    this.log = new Logger('@tvlabs/wdio-service', this._config.logLevel);

    this.injectAuthorizationHeader();
    this.setupTransformRequest();

    this.log.info(`Instantiated TVLabsService v${getServiceVersion()}`);
  }

  /**
   * Creates a TVLabsService instance bound to an existing Appium session.
   *
   * Use this when you have an Appium session ID (e.g. from `driver.sessionId`
   * after a previous `remote()` call, possibly in another process) and want
   * to attach to it via `attach({ sessionId, ...wdOpts })`. The returned
   * service supports `lastRequestId()`, `requestMetadata()`, and
   * `sessionMetadata()` without calling `beforeSession()`.
   *
   * **Important:** `wdOpts` must be the same reference later passed to
   * `attach()`. The factory mutates it to inject the authorization header
   * and the request-id tracking hook.
   *
   * To verify the session exists before using it, call
   * `await service.sessionMetadata(appiumSessionId)` immediately after
   * construction. It throws if the session is not found or the API key
   * cannot access it.
   *
   * @param appiumSessionId - The Appium session ID returned by the proxy on the original `POST /session`. This is the value of `driver.sessionId` after `remote()` succeeded.
   * @param options - Service options.
   * @param wdOpts - WebdriverIO remote options. Must be the same reference passed to `attach()`.
   */
  static fromSession(
    appiumSessionId: string,
    options: TVLabsServiceOptions,
    wdOpts: Options.WebdriverIO & { capabilities?: unknown },
  ): TVLabsService {
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

    service._rehydratedSessionId = appiumSessionId;

    return service;
  }

  /**
   * Returns the Appium session ID bound via `fromSession()`, or `undefined`
   * for service instances created through the standard constructor.
   */
  get rehydratedSessionId(): string | undefined {
    return this._rehydratedSessionId;
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

  /**
   * Closes any long-lived connections held by the service (currently the
   * metadata channel WebSocket). Safe to call when no channel was opened.
   * Call this when you are finished with the service so the process can exit.
   *
   * **Ordering:** Await all in-flight `requestMetadata()` calls before calling
   * `disconnect()`. Tearing down the metadata channel while a request is
   * pending will cause that call to reject.
   */
  async disconnect(): Promise<void> {
    if (this.metadataChannel) {
      await this.metadataChannel.disconnect();
      this.metadataChannel = undefined;
    }
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
    if (this._rehydratedSessionId) {
      throw new SevereServiceError(
        'beforeSession() is not valid on a rehydrated service. The session was supplied to fromSession() and should not be recreated.',
      );
    }

    this.platformSessionId = undefined;

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

      this.platformSessionId = await sessionChannel.newSession(
        capabilities,
        this.retries(),
      );

      capabilities[TVLABS_SESSION_ID_CAPABILITY] = this.platformSessionId;

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

  private setupTransformRequest() {
    const originalTransformRequest = this._config.transformRequest;

    this._config.transformRequest = (
      requestOptions: WebdriverTransformableRequest,
    ) => {
      const transformedRequestOptions =
        typeof originalTransformRequest === 'function'
          ? originalTransformRequest(requestOptions)
          : requestOptions;

      if (this.attachRequestId()) {
        this.attachRequestIdHeader(transformedRequestOptions);
      }

      if (this.platformSessionId) {
        this.injectSessionIdIntoRequest(
          transformedRequestOptions,
          this.platformSessionId,
        );
      }

      return transformedRequestOptions;
    };
  }

  private attachRequestIdHeader(requestOptions: WebdriverTransformableRequest) {
    const requestId = crypto.randomUUID();

    if (typeof requestOptions.headers === 'undefined') {
      requestOptions.headers = <HeadersInit>{};
    }

    this.setRequestHeader(requestOptions.headers, 'x-request-id', requestId);

    this.log.debug('ATTACHED REQUEST ID', requestId);

    this.setRequestId(requestId);
  }

  /**
   * Injects `tvlabs:session_id` directly into the outgoing `POST /session`
   * body to ensure that the capabilities object used to create the session
   * carries the correct value in case the user copied it and the assignment
   * by reference doesn't take hold.
   */
  private injectSessionIdIntoRequest(
    requestOptions: WebdriverTransformableRequest,
    platformSessionId: string,
  ) {
    const payload = this.readNewSessionPayload(requestOptions);

    if (!payload) {
      return;
    }

    const { capabilities } = payload;
    const alwaysMatch = (capabilities.alwaysMatch ??= {});
    const existing = alwaysMatch[TVLABS_SESSION_ID_CAPABILITY];

    if (existing === platformSessionId) {
      // Capability is already correct, no-op
      return;
    }

    if (typeof existing === 'string') {
      this.log.warn(
        `Outgoing session request carried ${TVLABS_SESSION_ID_CAPABILITY} "${existing}", replacing it with "${platformSessionId}" from this service instance.`,
      );
    } else {
      this.log.warn(
        `Outgoing session request was missing ${TVLABS_SESSION_ID_CAPABILITY}, re-attaching "${platformSessionId}". This usually means the capabilities object was copied after beforeSession() ran — see https://github.com/tv-labs/wdio-service#capabilities-injection.`,
      );
    }

    alwaysMatch[TVLABS_SESSION_ID_CAPABILITY] = platformSessionId;

    // v8 sends a JSONWP copy of the capabilities next to the W3C payload. It
    // is usually the very same object as `alwaysMatch`, but keep the two in
    // step when it is not.
    if (payload.desiredCapabilities) {
      payload.desiredCapabilities[TVLABS_SESSION_ID_CAPABILITY] =
        platformSessionId;
    }

    this.writeNewSessionPayload(requestOptions, payload);
  }

  /**
   * Returns the new-session payload carried by an outgoing request, or
   * `undefined` when the request is not a session creation request.
   */
  private readNewSessionPayload(
    requestOptions: WebdriverTransformableRequest,
  ): WebdriverSessionCreatePayload | undefined {
    // v9 (fetch): the payload is already serialized.
    if (typeof requestOptions.body === 'string') {
      let payload: unknown;

      try {
        payload = JSON.parse(requestOptions.body);
      } catch {
        return undefined;
      }

      return this.isNewSessionPayload(payload) ? payload : undefined;
    }

    // v8 (got): the payload is a live object that `got` serializes later.
    return this.isNewSessionPayload(requestOptions.json)
      ? requestOptions.json
      : undefined;
  }

  private writeNewSessionPayload(
    requestOptions: WebdriverTransformableRequest,
    payload: WebdriverSessionCreatePayload,
  ) {
    const body = JSON.stringify(payload);

    // Under v8 the payload was mutated in place and `got` serializes it on
    // send, so only the serialized v9 body needs writing back.
    if (typeof requestOptions.body === 'string') {
      requestOptions.body = body;
    }

    // `Content-Length` is computed from the original payload before
    // `transformRequest` runs, so a rewritten payload must refresh it.
    if (this.hasRequestHeader(requestOptions.headers, 'content-length')) {
      this.setRequestHeader(
        requestOptions.headers,
        'Content-Length',
        `${new TextEncoder().encode(body).length}`,
      );
    }
  }

  private isNewSessionPayload(
    payload: unknown,
  ): payload is WebdriverSessionCreatePayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const capabilities = (payload as WebdriverSessionCreatePayload)
      .capabilities;

    if (typeof capabilities !== 'object' || capabilities === null) {
      return false;
    }

    return 'alwaysMatch' in capabilities || 'firstMatch' in capabilities;
  }

  private hasRequestHeader(
    headers: RequestInit['headers'],
    header: string,
  ): boolean {
    if (headers instanceof Headers) {
      return headers.has(header);
    }

    if (Array.isArray(headers)) {
      return headers.some(([key]) => key.toLowerCase() === header);
    }

    if (typeof headers === 'object' && headers !== null) {
      return Object.keys(headers).some((key) => key.toLowerCase() === header);
    }

    return false;
  }

  private setRequestHeader(
    headers: RequestInit['headers'],
    header: string,
    value: string,
  ) {
    if (headers instanceof Headers) {
      headers.set(header, value);
    } else if (typeof headers === 'object' && headers !== null) {
      if (Array.isArray(headers)) {
        const existing = headers.find(
          ([key]) => key.toLowerCase() === header.toLowerCase(),
        );

        if (existing) {
          existing[1] = value;
        } else {
          headers.push([header, value]);
        }
      } else {
        const existing = Object.keys(headers).find(
          (key) => key.toLowerCase() === header.toLowerCase(),
        );

        headers[existing ?? header] = value;
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
