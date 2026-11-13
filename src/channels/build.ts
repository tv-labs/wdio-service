import { type Channel } from 'phoenix';
import { SevereServiceError } from 'webdriverio';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { BaseChannel } from './base.js';

import type {
  DeviceIOExtractBuildInfoResponse,
  DeviceIORequestUploadUrlResponse,
  DeviceIOBuildMetadata,
  LogLevel,
} from '../types.js';

export class BuildChannel extends BaseChannel {
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
      '@deviceio/build-channel',
    );
    this.lobbyTopic = this.socket.channel('upload:lobby');
  }

  async disconnect(): Promise<void> {
    return new Promise((res, _rej) => {
      this.lobbyTopic.leave();
      this.socket.disconnect(() => res());
    });
  }

  async connect(): Promise<void> {
    try {
      this.log.debug('Connecting to build channel...');

      this.socket.connect();

      await this.join(this.lobbyTopic);

      this.log.debug('Connected to build channel!');
    } catch (error) {
      this.log.error('Error connecting to build channel:', error);
      throw new SevereServiceError(
        'Could not connect to build channel, please check your connection.',
      );
    }
  }

  async uploadBuild(buildPath: string, appSlug?: string): Promise<string> {
    const metadata = await this.getFileMetadata(buildPath);

    this.log.info(
      `Requesting upload for build ${metadata.filename} (${metadata.type}, ${metadata.size} bytes)`,
    );

    const { existing, build_id, url } = await this.requestUploadUrl(
      metadata,
      appSlug,
    );

    if (existing) {
      this.log.info('Build is pre-existing, skipping upload');
    } else {
      this.log.info('Uploading build...');

      await this.uploadToUrl(url, buildPath, metadata);

      const { application_id } = await this.extractBuildInfo();

      this.log.info(`Build "${application_id}" processed successfully`);
    }

    return build_id;
  }

  private async requestUploadUrl(
    metadata: DeviceIOBuildMetadata,
    appSlug: string | undefined,
  ) {
    try {
      return await this.push<DeviceIORequestUploadUrlResponse>(
        this.lobbyTopic,
        'request_upload_url',
        { metadata, application_slug: appSlug },
      );
    } catch (error) {
      this.log.error('Error requesting upload URL:', error);
      throw error;
    }
  }

  private async uploadToUrl(
    url: string,
    filePath: string,
    metadata: DeviceIOBuildMetadata,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': metadata.type,
          'Content-Length': String(metadata.size),
        },
        // @ts-expect-error - FIXME: fetch types are incorrect
        body: fs.createReadStream(filePath),
        duplex: 'half',
      });

      if (!response.ok) {
        throw new SevereServiceError(
          `Failed to upload build to storage, got ${response.status}`,
        );
      }

      this.log.info('Upload complete');
    } catch (error) {
      this.log.error('Error uploading build:', error);
      throw error;
    }
  }

  private async extractBuildInfo() {
    this.log.info('Processing uploaded build...');

    try {
      return await this.push<DeviceIOExtractBuildInfoResponse>(
        this.lobbyTopic,
        'extract_build_info',
        {},
      );
    } catch (error) {
      this.log.error('Error processing build:', error);
      throw error;
    }
  }

  private async getFileMetadata(
    buildPath: string,
  ): Promise<DeviceIOBuildMetadata> {
    const filename = path.basename(buildPath);
    const size = fs.statSync(buildPath).size;
    const type = this.detectMimeType(filename);
    const sha256 = await this.computeSha256(buildPath);

    return { filename, type, size, sha256 };
  }

  private async computeSha256(buildPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(buildPath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  private detectMimeType(filename: string): string {
    const fileExtension = path.extname(filename).toLowerCase();

    switch (fileExtension) {
      case '.apk':
        return 'application/vnd.android.package-archive';
      case '.zip':
        return 'application/zip';
      default:
        return 'application/octet-stream';
    }
  }
}
