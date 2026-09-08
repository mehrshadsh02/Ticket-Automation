# Changelog

## 0.3.0 - 2026-09-08

- Added real Microsoft To Do integration through Microsoft Graph v1.0.
- Added delegated device-code OAuth and persistent MSAL token caching.
- Added configured list creation, task create/update/complete/reopen, linked ticket URLs, and Graph-side duplicate prevention.
- Added Graph failure/retry and restart/reopen test coverage.

## 0.2.0 - 2026-09-07

- Added durable SQLite ticket persistence and Todo task mappings.
- Added Helpical lifecycle state mapping, completion, and critical reopen behavior.
- Added idempotent processing, duplicate prevention, restart persistence, and retry-safe external updates.
- Added the Todo service boundary without implementing Microsoft Graph.
- Added comprehensive state and persistence integration tests.

## 0.1.0 - 2026-09-07

- Initialized the Helpical TypeScript and Playwright foundation.
- Added validated environment and center configuration.
- Added ticket/message models, Helpical page objects, and ticket collector.
- Added DOM parsing, filtering, collector, login, and browser tests.
- Added stable project contract and operational documentation.

- Added production synchronization runner and CLI entrypoint.

- Added Windows Task Scheduler operation scripts and production defaults.
