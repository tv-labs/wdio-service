import { remote } from 'webdriverio';
import { DeviceIOService } from '../src/index.ts';

const apiKey = process.env.DEVICEIO_API_TOKEN;

const capabilities = {
  'device:build': '00000000-0000-0000-0000-000000000000',
  'device:teleport_region': 'fake',
  'device:constraints': 'platform_key:dev AND model:"Virtual Device"',
};

const wdOpts = {
  hostname: 'localhost',
  port: 4723, // Appium proxy
  logLevel: 'info',
  capabilities,
};

const serviceOpts = {
  apiKey,
  sessionEndpoint: 'ws://localhost:4000/appium',
};

const service = new DeviceIOService(serviceOpts, capabilities, wdOpts);

async function runTest() {
  await service.beforeSession(wdOpts, capabilities, [], '');
  const driver = await remote(wdOpts);

  console.log('The session id is: ', driver.sessionId);

  const requests = [];

  try {
    for (let i = 0; i < 3; ++i) {
      await driver.execute('fake: getThing', {
        thing: 'thing',
      });

      requests.push(service.lastRequestId());
    }
  } finally {
    await driver.pause(1000);
    await driver.deleteSession();
  }

  const allRequests = await service.requestMetadata(driver.sessionId, requests);
  const singleRequest = await service.requestMetadata(
    driver.sessionId,
    requests[0],
  );

  console.log('Single request', singleRequest);
  console.log('All requests', allRequests);
}

runTest()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
