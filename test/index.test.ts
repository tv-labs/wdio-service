import { describe, expect, it } from 'vitest';
import DeviceIOService, {
  DeviceIOService as NamedDeviceIOService,
  TVLabsService,
  type TVLabsServiceOptions,
  type DeviceIOServiceOptions,
} from '../src/index.js';

describe('package exports', () => {
  it('exports DeviceIOService as both the default and a named export', () => {
    expect(NamedDeviceIOService).toBe(DeviceIOService);
  });

  it('keeps the deprecated TVLabsService alias pointing at DeviceIOService', () => {
    expect(TVLabsService).toBe(DeviceIOService);
    expect(typeof TVLabsService.fromSession).toBe('function');
  });

  it('keeps the deprecated TVLabs* types assignable to the DeviceIO* types', () => {
    const legacy: TVLabsServiceOptions = { apiKey: 'key' };
    const current: DeviceIOServiceOptions = legacy;

    expect(current.apiKey).toBe('key');
  });
});
