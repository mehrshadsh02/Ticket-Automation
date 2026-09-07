# Architecture

The foundation separates browser concerns from orchestration and future integrations:

```text
config/   environment validation and center registry
models/   stable domain interfaces
pages/    Helpical UI navigation and DOM parsing
services/ use-case orchestration (currently TicketCollector)
storage/  future persistence adapters
utils/    pure text, URL, and logging helpers
tests/    DOM-contract and service tests
```

`LoginPage` uses Helpical's real `#login-form` contract. `TicketListPage` locates the relevant table by required semantic headers, then builds a header-to-column map so column reordering is safe. `TicketPage` scopes conversation parsing to Helpical's `#talks .talks-holder` structure and treats `.talks-holder` as a class collection rather than trusting duplicated IDs.

`TicketCollector` depends on small list/detail interfaces. This allows later retry, telemetry, persistence, and Microsoft To Do adapters without coupling them to selectors. It filters against enabled `CenterConfig` values before visiting detail pages.
