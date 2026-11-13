import DeviceIOService from './service.js';

/**
 * @deprecated Use `DeviceIOService`. Kept so existing WebdriverIO configs keep
 * working, and will be removed in the next major release.
 */
const TVLabsService = DeviceIOService;
/** @deprecated Use `DeviceIOService`. */
type TVLabsService = DeviceIOService;

export { DeviceIOService, TVLabsService };
export default DeviceIOService;
export * from './types.js';
