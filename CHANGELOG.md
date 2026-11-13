# Changelog

All notable changes to `@deviceio/wdio-service` are documented in this file.

## [0.2.0] - 2026-11-13

### Changed

- Rebranded to Device.io. Capabilities now use the `device:` prefix (`device:build`, `device:session_id`), and the README examples use the `webdriver.device.io` hostname.
- The package is now published as `@deviceio/wdio-service` from the `deviceio/wdio-service` repository.

### Fixed

- Dual-write capabilities: the legacy `tvlabs:build` and `tvlabs:session_id` capabilities are still written alongside their `device:*` counterparts, so the service keeps working against platform versions that only read the old prefix.
- `tvlabs:session_id` is always injected on `POST /session`, even when the capabilities object was copied by the user.

## [0.1.14]

- Previous releases are not documented in this file; see the git history.
