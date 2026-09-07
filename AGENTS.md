# Agent Instructions

Read `docs/CONTRACT.md` before changing production behavior. Keep browser interaction in `pages/`, orchestration in `services/`, configuration in `config/`, domain types in `models/`, persistence adapters in `storage/`, and reusable pure helpers in `utils/`.

Never add credentials, session state, personal data, or tenant-specific secrets to source control. Center names belong only in configuration. Use Helpical's rendered UI/DOM; do not introduce private or invented HTTP APIs.

Before handing off changes, run `npm ci`, `npm run typecheck`, `npm test`, and `npm run lint`. Update `docs/PROGRESS.md`, `docs/TODO.md`, and `docs/CHANGELOG.md` when project state changes.
