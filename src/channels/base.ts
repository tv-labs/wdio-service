import { WebSocket } from 'ws';
import { Socket, type Channel } from 'phoenix';
import { SevereServiceError } from 'webdriverio';
import { Logger } from '../logger.js';
import { getServiceInfo } from '../utils.js';

import type { DeviceIOSocketParams, LogLevel } from '../types.js';
import type { PhoenixChannelJoinResponse } from '../phoenix.js';

export abstract class BaseChannel {
  protected socket: Socket;
  protected log: Logger;

  constructor(
    protected endpoint: string,
    protected maxReconnectRetries: number,
    protected key: string,
    protected logLevel: LogLevel = 'info',
    loggerName: string,
  ) {
    this.log = new Logger(loggerName, this.logLevel);

    this.socket = new Socket(this.endpoint, {
      transport: WebSocket,
      params: this.params(),
      reconnectAfterMs: this.reconnectAfterMs.bind(this),
    });

    this.socket.onError((...args) =>
      BaseChannel.logSocketError(this.log, ...args),
    );
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  protected async join(topic: Channel): Promise<void> {
    return new Promise((res, rej) => {
      topic
        .join()
        .receive('ok', (_resp: PhoenixChannelJoinResponse) => {
          res();
        })
        .receive('error', ({ response }: PhoenixChannelJoinResponse) => {
          rej('Failed to join topic: ' + response);
        })
        .receive('timeout', () => {
          rej('timeout');
        });
    });
  }

  protected async push<T>(
    topic: Channel,
    event: string,
    payload: object,
  ): Promise<T> {
    return new Promise((res, rej) => {
      topic
        .push(event, payload)
        .receive('ok', (msg: T) => {
          res(msg);
        })
        .receive('error', (reason: string) => {
          rej(reason);
        })
        .receive('timeout', () => {
          rej('timeout');
        });
    });
  }

  private params(): DeviceIOSocketParams {
    const serviceInfo = getServiceInfo();

    this.log.debug('Info:', serviceInfo);

    return {
      ...serviceInfo,
      api_key: this.key,
    };
  }

  private reconnectAfterMs(tries: number) {
    if (tries > this.maxReconnectRetries) {
      throw new SevereServiceError(
        'Could not connect to Device.io, please check your connection.',
      );
    }

    const wait = [0, 1000, 3000, 5000][tries] || 10000;

    this.log.info(
      `[${tries}/${this.maxReconnectRetries}] Waiting ${wait}ms before re-attempting to connect...`,
    );

    return wait;
  }

  private static logSocketError(
    log: Logger,
    event: ErrorEvent,
    _transport: new (endpoint: string) => object,
    _establishedConnections: number,
  ) {
    const error = event.error;

    log.error('Socket error:', error || event);
  }
}
