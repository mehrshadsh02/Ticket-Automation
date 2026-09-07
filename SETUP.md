# Setup

## Prerequisites

- Node.js 22.x or newer
- npm 11.x or newer
- Google Chrome stable (the default Playwright test channel)
- Microsoft Entra app registration configured as a public client

Install dependencies and the browser:

```bash
npm ci
npx playwright install-deps chromium # Linux only, if Chrome dependencies are missing
```

Copy `.env.example` to `.env` and replace every deployment value. `.env` is ignored by Git.

| Variable                     | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `HELPICAL_BASE_URL`          | Tenant root URL, with or without trailing slash                 |
| `HELPICAL_USERNAME`          | Helpical login identity                                         |
| `HELPICAL_PASSWORD`          | Helpical login secret                                           |
| `TODO_LIST_NAME`             | Microsoft To Do list used for Helpical tasks                    |
| `POLL_INTERVAL_MINUTES`      | Positive collection interval                                    |
| `DATABASE_PATH`              | Reserved local database path for the later sync stage           |
| `LOG_LEVEL`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `MICROSOFT_CLIENT_ID`        | Entra application (client) ID                                   |
| `MICROSOFT_TENANT_ID`        | Tenant ID or `common` for supported multi-tenant accounts       |
| `MICROSOFT_TOKEN_CACHE_PATH` | Untracked persistent MSAL token-cache file                      |

## Microsoft Entra / Graph

Create an app registration, enable public client/device-code authentication, and add the delegated Microsoft Graph permission `Tasks.ReadWrite`. Admin consent depends on the tenant policy. Do not create a client secret for this public-client flow.

On first authentication, follow the device-code message printed by the process. Later runs use the persistent token cache and silent refresh. Keep the cache path private and outside source control.

Run verification:

```bash
npm run typecheck
npm test
npm run lint
```

The automated suite uses isolated HTML matching Helpical's verified DOM contracts and does not require secrets. A live smoke test should be run only in a secured deployment environment.
