import { DeviceIOServiceInfo } from './types.js';
import packageJson from '../package.json';

export function getServiceInfo(): DeviceIOServiceInfo {
  return {
    service_name: getServiceName(),
    service_version: getServiceVersion(),
  };
}

export function getServiceVersion(): string {
  return packageJson.version;
}

export function getServiceName(): string {
  return packageJson.name;
}
