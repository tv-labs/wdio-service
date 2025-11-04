<p align="center">
  <a href="https://tvlabs.ai">
    <img alt="TV Labs Logo" width="200" src="https://tvlabs.ai/images/tvlabs.svg" />
  </a>
</p>

<p align="center">
  <b>@tvlabs/wdio-service</b> is a <a href="https://webdriver.io/">WebdriverIO</a> service for seamless integration with the <a href="https://tvlabs.ai">TV Labs</a> platform.
</p>

## Introduction

[![npm](https://img.shields.io/npm/v/@tvlabs/wdio-service)](https://www.npmjs.com/package/@tvlabs/wdio-service)

The `@tvlabs/wdio-service` package uses a websocket to connect to the TV Labs platform before an Appium session begins, logging events relating to build upload and session creation as they occur. This offloads the responsibility of creating the TV Labs session from the `POST /session` Webdriver endpoint, leading to more reliable session requests and creation.

If a build path is provided, the service first makes a build upload request to the TV Labs platform, and then sets the `tvlabs:build` capability to the newly created build ID.

The service then makes a session request and then subscribes to events for that request. Once the session has been filled and is ready for the Webdriver script to begin, the service receives a ready event with the TV Labs session ID. This session ID is injected into the capabilities as `tvlabs:session_id` on the Webdriver session create request.

Additionally, the service adds a unique request ID for each request made. The service will generate and attach an `x-request-id` header before each request to the TV Labs platform. This can be used to correlate requests in the client side logs to the Appium server logs.

## Installation

In your WebdriverIO project, run one of the following commands to install:

### NPM

```
npm i --save @tvlabs/wdio-service
```

### Yarn

```
yarn add @tvlabs/wdio-service
```

## Usage

### WebdriverIO Test Runner

To use this as a WebdriverIO test runner service, include the service in your WebdriverIO configuration file (e.g. `wdio.conf.ts`) with your TV Labs API key set in the options.

```javascript
import { TVLabsService } from '@tvlabs/wdio-service';

export const config = {
  // ...
  services: [[TVLabsService, { apiKey: process.env.TVLABS_API_KEY }]],
  // ...
};
```

### WebdriverIO Remote

To use this with WebdriverIO remote but without the test runner, call the beforeSession hook before instantiating the remote.

```javascript
import { remote } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

async function run() {
  const capabilities = { ... };

  const wdOpts = {
    capabilities,
    hostname: 'appium.tvlabs.ai',
    port: 4723,
    headers: {
      Authorization: `Bearer ${process.env.TVLABS_API_TOKEN}`,
    },
  };

  const serviceOpts = {
    apiKey: process.env.TVLABS_API_TOKEN,
  }

  const service = new TVLabsService(serviceOpts, capabilities, {})

  // The TV Labs service does not use specs or a cid, pass default values.
  const cid = ""
  const specs = []

  await service.beforeSession(wdOpts, capabilities, specs, cid)

  const driver = await remote(wdOpts);

  try {
    // ...
  } finally {
    await driver.deleteSession();
  }
}

run();
```

## Options

### `apiKey`

- **Type:** `string`
- **Required:** Yes
- **Description:** TV Labs API key used for authentication to the platform

### `buildPath`

- **Type:** `string`
- **Required:** No
- **Description:** Path to the packaged build to use for the session. When provided, this will perform a build upload before the session is created, and sets the `tvlabs:build` capability to the newly created build ID. The build is uploaded under the organizations default App unless the `app` option is provided

### `app`

- **Type:** `string`
- **Required:** No
- **Description:** The slug of the app on the TV Labs platform to use to upload the build. When not provided, the organization's default app is used. You may find or create an app on the [Apps page](https://tvlabs.ai/app/apps) in the TV Labs platform.

### `retries`

- **Type:** `number`
- **Required:** No
- **Default:** `3`
- **Description:** Maximum number of attempts to create a session before failing

### `reconnectRetries`

- **Type:** `number`
- **Required:** No
- **Default:** `5`
- **Description:** Maximum number of attempts to re-connect if the connection to TV Labs is lost.

### `attachRequestId`

- **Type:** `boolean`
- **Required:** No
- **Default:** `true`
- **Description:** Controls whether or not to attach an `x-request-id` header to each request made to the TV Labs platform.

### `continueOnError`

- **Type:** `boolean`
- **Required:** No
- **Default:** `false`
- **Description:** Whether to continue the session request if any step fails. When `true`, the session request will still be made with the original provided capabilities. When `false`, the service will exit with a non-zero code.

## Methods

### `lastRequestId()`

- **Returns:** `string | undefined`
- **Description:** Returns the last request ID that was attached to a request made to the TV Labs platform. This is useful for correlating client-side logs with server-side logs. Returns `undefined` if no request has been made yet or if `attachRequestId` is set to `false`.

#### Example

```javascript
import { remote } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const service = new TVLabsService(
  { apiKey: process.env.TVLABS_API_KEY },
  capabilities,
  {},
);

await service.beforeSession(wdOpts, capabilities, [], '');

const driver = await remote(wdOpts);

// Get the last request ID
const requestId = service.lastRequestId();
console.log(`Last request ID: ${requestId}`);
```
