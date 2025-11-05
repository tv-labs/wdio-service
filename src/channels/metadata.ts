import { type Channel } from 'phoenix';
import { SevereServiceError } from 'webdriverio';
import { BaseChannel } from './base.js';

import type { LogLevel, TVLabsRequestMetadataResponse } from '../types.js';

export class MetadataChannel extends BaseChannel {
  private lobbyTopic: Channel;

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
      '@tvlabs/metadata-channel',
    );
    this.lobbyTopic = this.socket.channel('metadata:lobby');
  }

  async disconnect(): Promise<void> {
    return new Promise((res, _rej) => {
      this.lobbyTopic.leave();
      this.socket.disconnect(() => res());
    });
  }

  async connect(): Promise<void> {
    try {
      this.log.debug('Connecting to metadata channel...');

      this.socket.connect();

      await this.join(this.lobbyTopic);

      this.log.debug('Connected to metadata channel!');
    } catch (error) {
      this.log.error('Error connecting to metadata channel:', error);
      throw new SevereServiceError(
        'Could not connect to metadata channel, please check your connection.',
      );
    }
  }

  async getRequestMetadata(
    appiumSessionId: string,
    requestIds: string[],
  ): Promise<TVLabsRequestMetadataResponse> {
    this.log.debug(
      `Fetching metadata for session ${appiumSessionId}, requests: ${requestIds.join(', ')}`,
    );

    try {
      const response = await this.push<TVLabsRequestMetadataResponse>(
        this.lobbyTopic,
        'appium_request_metadata',
        {
          appium_session_id: appiumSessionId,
          request_ids: requestIds,
        },
      );

      this.log.debug(
        `Received metadata for ${Object.keys(response).length} request(s)`,
      );

      return response;
    } catch (error) {
      this.log.error('Error fetching request metadata:', error);
      throw error;
    }
  }
}
