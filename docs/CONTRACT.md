# Stable Project Contract

- Helpical is accessed only through its rendered browser UI with Playwright. No Helpical API is assumed or invented.
- Credentials and deployment values come only from environment-backed configuration. Secrets are never hard-coded, logged, or committed.
- `package.json` and `package-lock.json` are the authoritative Node dependency manifests. `requirements.txt` documents system/runtime/browser prerequisites only.
- Centers are `CenterConfig` records (`id`, `name`, `enabled`) in configuration. Business logic must not contain center names; adding a center requires configuration only.
- Page objects own selectors and DOM parsing. Services orchestrate page objects and domain models. Storage implementations remain behind the `storage/` boundary.
- Selectors must use stable semantic attributes, form names, Helpical classes, and table headers. Positional CSS selectors and assumptions about unique `talks-holder` IDs are forbidden.
- Ticket list parsing produces ID, title, priority, organization, center, creator, assignee, status, created/updated dates, and detail URL.
- Ticket detail parsing produces title, ticket status, every message's author/date/text/status, and the latest message.
- SQLite is the durable source of truth for ticket state and Microsoft To Do mappings.
- Microsoft To Do access uses delegated Microsoft Graph OAuth permission `Tasks.ReadWrite`; tokens and credentials are never committed.
- A Helpical ticket maps to exactly one Todo task. Updates, completion, and reopen operations must reuse its persisted task/list IDs.
