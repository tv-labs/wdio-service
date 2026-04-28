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

Additionally, the service automatically injects an `Authorization` header with your API key (formatted as `Bearer ${apiKey}`) into all requests to the TV Labs platform. If you have already set an `Authorization` header in your configuration, the service will respect your existing header and not override it.

The service also adds a unique request ID for each request made. The service will generate and attach an `x-request-id` header before each request to the TV Labs platform. This can be used to correlate requests in the client side logs to the Appium server logs.

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
    port: 4723
  };

  const serviceOpts = {
    apiKey: process.env.TVLABS_API_TOKEN,
  }

  // NOTE: it is important to make sure that
  // the wdOpts passed here are the same reference
  // as the one passed to remote()
  const service = new TVLabsService(serviceOpts, capabilities, wdOpts)

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

const capabilities = { ... };
const wdOpts = { ... };

const service = new TVLabsService(
  { apiKey: process.env.TVLABS_API_KEY },
  capabilities,
  wdOpts
);

await service.beforeSession(wdOpts, capabilities, [], '');

const driver = await remote(wdOpts);

// Get the last request ID
const requestId = service.lastRequestId();
console.log(`Last request ID: ${requestId}`);
```

### `requestMetadata()`

- **Parameters:** `appiumSessionId: string, requestIds: string | string[]`
- **Returns:** `Promise<TVLabsRequestMetadata | TVLabsRequestMetadataResponse>`
- **Description:** Fetches metadata for one or more Appium request IDs from the TV Labs platform. If a single request ID is provided, returns the metadata for that request. If an array of request IDs is provided, returns a map where keys are request IDs and values are their corresponding metadata.

> **Note:** Request metadata is processed asynchronously on the TV Labs platform. To ensure metadata is available, it is recommended to fetch request metadata a few seconds after the request, or after the session has ended.

#### Example

```javascript
import { remote } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const capabilities = { ... };
const wdOpts = { ... };

const service = new TVLabsService(
  { apiKey: process.env.TVLABS_API_KEY },
  capabilities,
  wdOpts
);

await service.beforeSession(wdOpts, capabilities, [], '');

const driver = await remote(wdOpts);
let requestId;

try {
  // Perform some actions that generate requests
  const element = await driver.$('#my-button');
  await element.click();

  // Get the request ID from the click
  requestId = service.lastRequestId();
  console.log(`Request ID: ${requestId}`);
} finally {
  await driver.deleteSession();
}

// Fetch metadata after session ends (recommended)
if (requestId) {
  const metadata = await service.requestMetadata(driver.sessionId, requestId);
  console.log('Request metadata:', metadata);
}

// Fetch metadata for multiple requests
const multiMetadata = await service.requestMetadata("appium-session-id-1234"[
  'request-id-123',
  'request-id-456',
  'request-id-789'
]);

console.log('Multiple requests metadata:', multiMetadata);
```

### `disconnect()`

- **Returns:** `Promise<void>`
- **Description:** Closes any long-lived connections held by the service (currently the metadata channel WebSocket opened by `requestMetadata()`). Call this when you are finished with the service so the process can exit. Safe to call when no channel was opened, and safe to call multiple times.

> **Note:** Await all in-flight `requestMetadata()` calls before calling `disconnect()`. Tearing down the metadata channel while a request is pending will cause that call to reject.

### `sessionMetadata()`

- **Parameters:** `appiumSessionId: string`
- **Returns:** `Promise<TVLabsSessionMetadataResponse>`
- **Description:** Fetches metadata for a session by Appium session ID from the TV Labs platform.

> **Note:** Partial metadata will be available immediately after session creation. Some session metadata such as recording end time, session end time, and session duration are added asynchronously on the TV Labs platform after the session ends. Before the session ends, these fields will be null.

> **Tip:** The response includes both IDs — `data.id` is the TV Labs session ID (useful for deep-linking into `https://tvlabs.ai/app/sessions/:id`) and `data.appium.session_id` is the Appium session ID. Consumers that only have the Appium session ID can resolve the TV Labs session ID from this response.

#### Example

```javascript
import { remote } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const capabilities = { ... };
const wdOpts = { ... };

const service = new TVLabsService(
  { apiKey: process.env.TVLABS_API_KEY },
  capabilities,
  wdOpts
);

await service.beforeSession(wdOpts, capabilities, [], '');

const driver = await remote(wdOpts);
const { sessionId } = driver;

try {
  const sessionMetadata = await service.sessionMetadata(sessionId);

  const { data:
    {
      device: {
        make: { display_name: make },
        model: { display_name: model, year }
      },
      recording: { start_time }
    }
  } = sessionMetadata;

  console.log(`Recording on ${year} ${make} ${model} started at ${start_time}`);
} finally {
  await driver.deleteSession();
}
```

### `TVLabsService.fromSession()`

- **Parameters:** `appiumSessionId: string, options: TVLabsServiceOptions, wdOpts: Options.WebdriverIO`
- **Returns:** `TVLabsService`
- **Description:** Creates a `TVLabsService` instance bound to an existing Appium session without calling `beforeSession()`. Use this when you have an Appium session ID (the value of `driver.sessionId` after a previous `remote()` call) and want to attach to that session via WebdriverIO's `attach()`.

The factory:

- Injects the `Authorization` header on `wdOpts`.
- Installs the `x-request-id` tracking hook on `wdOpts` (unless `attachRequestId: false`), so `lastRequestId()` works locally.
- Records the Appium session ID for use by `appiumSessionId`, `requestMetadata()`, and `sessionMetadata()`.

> **Important:** `wdOpts` must be the same reference later passed to `attach()`.

> **Note:** Calling `beforeSession()` on a service created via `fromSession()` throws a `SevereServiceError` to prevent accidentally creating a duplicate session.

> **Tip:** To verify the session exists before using it, call `await service.sessionMetadata(appiumSessionId)` immediately after construction. It throws a `SevereServiceError` if the session is not found or the API key cannot access it.

#### Example

```javascript
import { attach } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const wdOpts = {
  capabilities: {},
  hostname: 'appium.tvlabs.ai',
  port: 4723,
};

// appiumSessionId is the value of driver.sessionId from the original remote()
// call, handed off via env var, queue message, etc.
const appiumSessionId = process.env.APPIUM_SESSION_ID;

const service = TVLabsService.fromSession(
  appiumSessionId,
  { apiKey: process.env.TVLABS_API_KEY },
  wdOpts,
);

const driver = await attach({
  sessionId: appiumSessionId,
  ...wdOpts,
  options: wdOpts,
});

try {
  const element = await driver.$('#my-button');
  await element.click();

  // Request tracking works locally
  const requestId = service.lastRequestId();

  // Telemetry queries work without beforeSession()
  const metadata = await service.requestMetadata(appiumSessionId, requestId);
  console.log('Request metadata:', metadata);
} finally {
  // Only delete the session if this process owns its lifecycle.
}
```

### `appiumSessionId`

- **Type:** getter
- **Returns:** `string | undefined`
- **Description:** Returns the Appium session ID bound via `fromSession()`, or `undefined` for service instances created through the standard constructor.

## Attaching to an Existing Session

WebdriverIO's [`attach()`](https://webdriver.io/docs/api/modules#attachoptions) binds a driver to a session that was created earlier — possibly by a different process. Use `TVLabsService.fromSession()` alongside `attach()` to keep TV Labs telemetry (`lastRequestId()`, `requestMetadata()`, `sessionMetadata()`) working for the attaching driver, without recreating the session.

The portable handle is the **Appium session ID** — the value of `driver.sessionId` after the original `remote()` call. Pass it through whatever channel fits your setup (env var, fixture, queue message, file). Both `requestMetadata()` and `sessionMetadata()` accept this ID, and `attach()` uses it to bind to the existing session.

### Creating the session

```javascript
import { remote } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const capabilities = { ... };
const wdOpts = {
  capabilities,
  hostname: 'appium.tvlabs.ai',
  port: 4723,
};

const service = new TVLabsService(
  { apiKey: process.env.TVLABS_API_KEY },
  capabilities,
  wdOpts
);

await service.beforeSession(wdOpts, capabilities, [], '');
const driver = await remote(wdOpts);

// Hand off driver.sessionId to wherever the next driver will attach
const appiumSessionId = driver.sessionId;
```

### Attaching to the session

```javascript
import { attach } from 'webdriverio';
import { TVLabsService } from '@tvlabs/wdio-service';

const wdOpts = {
  capabilities: {},
  hostname: 'appium.tvlabs.ai',
  port: 4723,
};

// appiumSessionId received from the process that called remote()
const service = TVLabsService.fromSession(
  appiumSessionId,
  { apiKey: process.env.TVLABS_API_KEY },
  wdOpts,
);

const driver = await attach({
  sessionId: appiumSessionId,
  ...wdOpts,
  options: wdOpts,
});

try {
  // All telemetry methods work
  const element = await driver.$('#my-button');
  await element.click();

  const requestId = service.lastRequestId();
  const metadata = await service.requestMetadata(appiumSessionId, requestId);
  const session = await service.sessionMetadata(appiumSessionId);
} finally {
  // Only delete the session if this process owns its lifecycle.
}
```

> **Note:** `lastRequestId()` is per-instance — each `TVLabsService` tracks the request IDs that flow through its own `transformRequest` hook. Use `requestMetadata()` and `sessionMetadata()` (both keyed by Appium session ID) for telemetry that needs to span instances.
