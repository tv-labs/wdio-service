import { type Channel } from 'phoenix';
import { SevereServiceError } from 'webdriverio';
import { BaseChannel } from './base.js';

import type {
  DeviceIOCapabilities,
  DeviceIOSessionRequestEventHandler,
  DeviceIOSessionRequestResponse,
  LogLevel,
} from '../types.js';

export class SessionChannel extends BaseChannel {
  private lobbyTopic: Channel;
  private requestTopic?: Channel;

  private readonly events = {
    SESSION_READY: 'session:ready',
    SESSION_FAILED: 'session:failed',
    REQUEST_CANCELED: 'request:canceled',
    REQUEST_FAILED: 'request:failed',
    REQUEST_FILLED: 'request:filled',
    REQUEST_MATCHING: 'request:matching',
  } as const;

  constructor(
    endpoint: string,
    maxReconnectRetries: number,
    key: string,
    logLevel: LogLevel = 'info',
  ) {
    super(
      endpoint,
      maxReconnectRetries,
      key,
      logLevel,
      '@deviceio/session-channel',
    );
    this.lobbyTopic = this.socket.channel('requests:lobby');
  }

  async disconnect(): Promise<void> {
    return new Promise((res, _rej) => {
      this.lobbyTopic.leave();
      this.requestTopic?.leave();
      this.socket.disconnect(() => res());
    });
  }

  async connect(): Promise<void> {
    try {
      this.log.debug('Connecting to session channel...');

      this.socket.connect();

      await this.join(this.lobbyTopic);

      this.log.debug('Connected to session channel!');
    } catch (error) {
      this.log.error('Error connecting to session channel:', error);
      throw new SevereServiceError(
        'Could not connect to session channel, please check your connection.',
      );
    }
  }

  async newSession(
    capabilities: DeviceIOCapabilities,
    maxRetries: number,
    retry = 0,
  ): Promise<string> {
    try {
      const requestId = await this.requestSession(capabilities);
      const sessionId = await this.observeRequest(requestId);

      return sessionId;
    } catch {
      return this.handleRetry(capabilities, maxRetries, retry);
    }
  }

  private async handleRetry(
    capabilities: DeviceIOCapabilities,
    maxRetries: number,
    retry: number,
  ): Promise<string> {
    if (retry < maxRetries) {
      this.log.warn(
        `Could not create a session, retrying (${retry + 1}/${maxRetries})`,
      );

      return this.newSession(capabilities, maxRetries, retry + 1);
    } else {
      throw new SevereServiceError(
        `Could not create a session after ${maxRetries} attempts.`,
      );
    }
  }

  private async observeRequest(requestId: string): Promise<string> {
    const cleanup = () => this.unobserveRequest();

    return new Promise<string>((res, rej) => {
      this.requestTopic = this.socket.channel(`requests:${requestId}`);

      const eventHandlers: Record<string, DeviceIOSessionRequestEventHandler> =
        {
          // Information events
          [this.events.REQUEST_MATCHING]: ({ request_id }) => {
            this.log.info(`Session request ${request_id} matching...`);
          },
          [this.events.REQUEST_FILLED]: ({ session_id, request_id }) => {
            this.log.info(
              `Session request ${request_id} filled: ${this.deviceIOSessionLink(session_id)}`,
            );

            this.log.info('Waiting for device to be ready...');
          },

          // Failure events
          [this.events.SESSION_FAILED]: ({ session_id, reason }) => {
            this.log.error(`Session ${session_id} failed, reason: ${reason}`);
            rej(reason);
          },
          [this.events.REQUEST_CANCELED]: ({ request_id, reason }) => {
            this.log.info(
              `Session request ${request_id} canceled, reason: ${reason}`,
            );
            rej(reason);
          },
          [this.events.REQUEST_FAILED]: ({ request_id, reason }) => {
            this.log.info(
              `Session request ${request_id} failed, reason: ${reason}`,
            );
            rej(reason);
          },

          // Ready event
          [this.events.SESSION_READY]: ({ session_id }) => {
            this.log.info(`Session ${session_id} ready!`);
            res(session_id);
          },
        };

      Object.entries(eventHandlers).forEach(([event, handler]) => {
        this.requestTopic?.on(event, handler);
      });

      this.join(this.requestTopic).catch((err) => {
        rej(err);
      });
    }).finally(cleanup);
  }

  private unobserveRequest() {
    Object.values(this.events).forEach((event) => {
      this.requestTopic?.off(event);
    });

    this.requestTopic?.leave();

    this.requestTopic = undefined;
  }

  private async requestSession(
    capabilities: DeviceIOCapabilities,
  ): Promise<string> {
    this.log.info('Requesting Device.io session');

    try {
      const response = await this.push<DeviceIOSessionRequestResponse>(
        this.lobbyTopic,
        'requests:create',
        { capabilities },
      );

      this.log.info(
        `Received session request ID: ${response.request_id}. Waiting for a match...`,
      );

      return response.request_id;
    } catch (error) {
      this.log.error('Error requesting session:', error);
      throw error;
    }
  }

  private deviceIOSessionLink(sessionId: string) {
    return `https://tvlabs.ai/app/sessions/${sessionId}`;
  }
}
