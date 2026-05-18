# PRD Function: Agent-Friendly API Provider Onboarding

Date: 2026-05-18
Author: Infinite Canvas maintainers

## Purpose

Infinite Canvas should be easy for non-coders, contributors, and future agents to configure with their own OpenAI-compatible or APIMart-style API providers without editing backend code, leaking keys, or guessing which frontend surfaces will update.

## Current State

- The API Settings page manages provider name, Base URL, protocol, API key, and image/chat/video model lists.
- Backend provider config is stored in `data/api_providers.json`.
- Secrets are stored in `API/.env` with provider-specific env names.
- Canvas, Online Image, and GPT Chat read provider/model lists from `/api/config`.
- Model lists can be pulled from `/v1/models` and categorized by lightweight keyword rules.

## Goals

- Provide one blessed agent-safe CLI for provider setup.
- Keep local secrets and runtime data ignored for public contribution.
- Reflect the same setup path in the API Settings frontend.
- Document the provider schema and endpoint contract for future contributors.
- Preserve existing UI behavior and provider runtime behavior.

## Non-Goals

- Do not replace the existing API Settings page.
- Do not add a new database.
- Do not hardcode any third-party provider key or private endpoint.
- Do not rewrite the high-blast-radius provider runtime functions unless a test proves it is necessary.

## User Experience

Users can still configure providers manually in the UI. Agents and advanced users can configure the same provider with:

```bash
export API_PROVIDER_MY_API_KEY="sk-..."
python3 scripts/configure_provider.py \
  --id my-api \
  --name "My API" \
  --base-url "https://api.example.com/v1" \
  --protocol openai \
  --api-key-env API_PROVIDER_MY_API_KEY \
  --image-model gpt-image-2 \
  --chat-model gpt-5.5
```

The API Settings page shows a provider-specific command using the current form values and the matching key environment variable. It never renders the real key.

## Safety Requirements

- `API/.env`, `data/`, `output/`, generated media folders, `.venv`, `.gitnexus`, and generated agent skill folders must stay ignored.
- CLI output must mask secrets and must not echo full key values.
- `--dry-run` must validate without writing files.
- CLI writes must be idempotent and atomic.
- Existing providers must be preserved when a provider is added or updated.
- Remote provider URLs must use HTTPS. Plain HTTP is only allowed for local development hosts.
- Saved keys must never be sent to an arbitrary request URL. Backend validation, model pulling, and async probing can reuse a saved key only against that provider's saved `base_url`.
- Changing a saved provider `base_url` while a key exists requires a new key in the same save. Process-env managed keys cannot be rebound by UI saves.
- Browser clients must never receive full saved provider keys. They can receive boolean key status and masked previews only.

## Contract

Provider fields:

- `id`: stable ASCII id, 2-40 chars, `[A-Za-z0-9_-]`.
- `name`: display name.
- `base_url`: upstream API root, with or without `/v1`.
- `protocol`: `openai` or `apimart`.
- `enabled`: whether the provider can be used.
- `primary`: preferred fallback provider when callers pass legacy or missing ids.
- `image_models`, `chat_models`, `video_models`: model ids exposed to frontend selectors.
- `ms_loras`, `ms_defaults_version`: ModelScope-specific extension fields.

Secret env naming:

- `modelscope` -> `MODELSCOPE_API_KEY`
- `comfly` -> `COMFLY_API_KEY`
- custom id -> `API_PROVIDER_<ID>_KEY`

## Success Criteria

- A clean checkout contains `API/.env.example` and docs but no real secrets.
- `python3 tests/test_agent_provider_config.py -v` passes.
- `python3 tests/test_sidebar_pin_static.py -v` still passes.
- API Settings visibly shows the agent setup command for the selected provider.
- A running backend reads updated `API/.env` values on the next request, so CLI writes can reflect in `/api/providers` without a full restart.
- A future agent can add/update a provider without manually editing JSON or leaking keys.
- Explicit process env secrets keep precedence over local `API/.env` values for deployed/runtime safety.
