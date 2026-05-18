# Changelog

## 2026-05-18

- Added `scripts/configure_provider.py`, a safe agent-friendly CLI for configuring custom API providers.
- Added `API/.env.example` and `.gitignore` rules to keep local secrets, runtime data, generated media, and agent indexes out of public contributions.
- Added an API Settings "Agent setup" panel that reflects the selected provider as a copyable CLI command.
- Added provider onboarding docs and API contract docs for future contributors and agents.
- Added regression tests for provider CLI behavior, frontend contract wiring, and repository hygiene.
- Updated backend key reads so direct CLI writes to `API/.env` reflect in provider status while preserving explicit process env precedence for deployed secrets.
- Hardened provider verification so saved keys can only be sent to the saved provider URL; testing a new URL requires a transient key.
- Stopped exposing saved ModelScope tokens to browser clients; server-side endpoints now use saved keys without returning them.
- Blocked saved-key provider URL rebinding unless a new key is supplied, and kept explicit process environment secrets from being overwritten by UI saves.
- Fixed `gpt-image-2` reference-image generation to use multipart `/v1/images/edits` instead of sending an unsupported `image` field to `/v1/images/generations`.
- Made single-node Canvas generation failures visible on the node with the existing failed status and retry/error bar, not only in a transient modal.
- Added a first-screen Text to Image API engine that reads configured API providers from `/api/config`, submits through `/api/online-image`, defaults to `gpt-image-*` when available, and shows API/ModelScope/local history in one gallery.
- Updated the Text to Image API engine to start one background image task per click, allowing multiple API images to render concurrently from the same page.
- Replaced raw `1024 × 1024` dimension inputs with ratio + `1K`/`2K`/`4K` size controls, and kept `gpt-image-2` 4K square requests square when clamping to provider limits.
