import { join } from 'path';
import { getServiceName, getServiceVersion } from '../src/utils.js';
import { promises as fs } from 'fs';

const packageJson = await fs.readFile(
  join(__dirname, '..', 'package.json'),
  'utf8',
);
const packageObject = JSON.parse(packageJson);

describe('Device.io Utils', () => {
  it('can get the service version', async () => {
    expect(getServiceVersion()).not.toBe('unknown');
    expect(getServiceVersion()).toBe(packageObject.version);
  });

  it('can get the service name', async () => {
    expect(getServiceName()).toBe('@deviceio/wdio-service');
  });
});
