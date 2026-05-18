# API Contract

This document describes the local HTTP and file contracts that future agents should use instead of guessing from UI code.

## Runtime Files

- `data/api_providers.json`: saved provider metadata. Ignored by git because it is local user configuration.
- `API/.env`: saved secrets and runtime overrides. Ignored by git.
- `API/.env.example`: safe template for contributors.

## Provider Schema

```json
{
  "id": "custom-api",
  "name": "Custom API",
  "base_url": "https://api.example.com/v1",
  "protocol": "openai",
  "enabled": true,
  "primary": false,
  "image_models": ["gpt-image-2"],
  "chat_models": ["gpt-5.5"],
  "video_models": ["veo3-fast"],
  "ms_loras": [],
  "ms_defaults_version": 0
}
```

`id` must match `[A-Za-z0-9_-]{2,40}` after normalization. Custom provider keys use `API_PROVIDER_<ID>_KEY`, where non-alphanumeric characters become underscores and the value is uppercased. Use `https://` for remote provider URLs; the agent CLI and backend reject remote `http://` URLs and only permit plaintext HTTP for local development hosts such as `localhost` and `127.0.0.1`.

## Endpoints

### `GET /api/config`

Returns global model defaults and public provider records. Secrets are not returned; providers include:

- `has_key`
- `key_preview`
- `key_env`

Consumers: `static/zimage.html`, `static/canvas.html`, `static/online.html`, `static/gpt-chat.html`.

### `GET /api/providers`

Returns `{ "providers": [...] }` using the same public provider shape as `/api/config`.

### `PUT /api/providers`

Saves provider metadata and optional API keys.

Body: JSON array of provider records. `api_key` is optional. If omitted, the existing key is preserved. If present as an empty string, the saved key is cleared.

### `POST /api/providers/test-connection`

Body:

```json
{
  "base_url": "https://api.example.com/v1",
  "api_key": "optional-unsaved-key",
  "provider_id": "custom-api"
}
```

Calls upstream `/v1/models`, validates connectivity, and returns categorized model suggestions.

Security rule: when `api_key` is empty and `provider_id` is supplied, the backend uses the saved key only with that provider's saved `base_url`. To test an unsaved or changed `base_url`, pass a transient `api_key` in the request body.

Save rule: if a provider already has a saved/effective key, changing `base_url` requires submitting a new non-empty `api_key` in the same `PUT /api/providers` request. If the key comes from an explicit process environment variable, the backend rejects URL changes for that provider ID because UI saves must not rebind process-managed secrets.

### `POST /api/providers/fetch-models`

Same body as `test-connection`. Returns all discovered model ids plus image/chat/video categories.

### `POST /api/providers/probe-async`

Tests whether the provider has an APIMart-style async task endpoint by calling `/v1/tasks/healthcheck_probe_do_not_submit`.

### `POST /api/online-image`

Generates one image through the selected provider. Body:

```json
{
  "prompt": "Describe the desired image",
  "provider_id": "custom-api",
  "model": "gpt-image-2",
  "size": "1024x1024",
  "quality": "low",
  "reference_images": [{ "url": "/assets/input/example.png", "name": "example.png" }]
}
```

For OpenAI-compatible GPT Image models such as `gpt-image-2`, text-only requests use `POST /v1/images/generations`. Requests with `reference_images` or mask images use multipart `POST /v1/images/edits`; GPT Image responses are expected as base64 image data rather than URL-only responses.

Frontend consumers include the standalone Online Image page, Infinite Canvas API generation nodes, GPT Chat image mode, and the default Text to Image console (`static/zimage.html`) API engine. The Text to Image console filters out `modelscope` for its generic API tab, keeps ModelScope as its own engine, and prefers `gpt-image-*` models when a provider also advertises image-like models that are not accepted by `/v1/images/generations`.

The Text to Image console does not call `/api/online-image` directly. It starts background work through `/api/canvas-image-tasks` so each click can create a separate in-flight API image task while earlier tasks continue rendering. Its size UI is ratio + resolution:

- 1K is the safest default for speed, cost, and broad model compatibility.
- 2K is useful for detail when the selected provider/model supports larger GPT Image-style outputs.
- 4K uses model-constrained dimensions such as `3840x2160`, `2160x3840`, or `2880x2880` for square. It should be treated as slower, more expensive, and more likely to hit upstream limits.

### `POST /api/canvas-image-tasks`

Starts the same image generation flow asynchronously for Infinite Canvas nodes and the Text to Image API engine, then returns `{ "task_id": "...", "status": "queued" }`.

### `GET /api/canvas-image-tasks/{task_id}`

Returns queued/running/succeeded/failed state for a canvas image task. Failed tasks include a human-readable `error` string for the canvas node and generation log.

### `GET /api/config/token`

Legacy compatibility endpoint for older static pages. It returns only `{ "token": "", "has_token": true|false }` and never returns the full saved ModelScope key. Static pages should call server-side generation endpoints with an empty `api_key` when `has_token` is true; the backend will use `MODELSCOPE_API_KEY` from process env or `API/.env`.

## Agent CLI

Use `scripts/configure_provider.py` for safe local configuration:

```bash
export API_PROVIDER_CUSTOM_API_KEY="sk-..."
python3 scripts/configure_provider.py \
  --name "Custom API" \
  --id custom-api \
  --base-url "https://api.example.com/v1" \
  --protocol openai \
  --api-key-env API_PROVIDER_CUSTOM_API_KEY \
  --image-model gpt-image-2 \
  --chat-model gpt-5.5
```

Useful flags:

- `--api-key-env NAME`: safest key input for agents.
- `--api-key-stdin`: avoids shell history.
- `--dry-run`: validates without writing files.
- `--fetch-models`: pulls `/v1/models` and merges detected model ids.
- `--print-json`: machine-readable output with masked key preview.
- `--list`: list saved providers with masked key previews.

Do not write provider JSON or `.env` by hand unless the CLI cannot run.
