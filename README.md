# Helpical Ticket Automation

An extensible TypeScript and Playwright automation that collects Helpical tickets through the rendered UI, persists state in SQLite, and synchronizes Microsoft To Do through Graph.

## Quick start

```bash
cp .env.example .env
npm ci
npm run typecheck
npm test
npm run lint
```

Set Helpical and Microsoft Entra values only in the untracked `.env` file or deployment environment. Register a public-client application with delegated `Tasks.ReadWrite`; the first run prints a device-code sign-in instruction. Tokens are stored in the configured ignored cache path.

SQLite preserves ticket/task mappings across restarts. The Graph adapter locates tasks by a Helpical ticket linked-resource ID before creating them, preventing duplicates after retries or interrupted runs.
