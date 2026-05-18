# Agent Provider Setup Guide

Use this guide when a future agent or contributor needs to configure a custom API provider.

## Recommended Flow

1. Put the key in an environment variable or provide it over stdin.

```bash
export API_PROVIDER_NANO_BANANA_KEY="sk-..."
```

2. Run the CLI from the repo root.

```bash
python3 scripts/configure_provider.py \
  --id nano-banana \
  --name "Nano Banana" \
  --base-url "https://api.example.com/v1" \
  --protocol openai \
  --api-key-env API_PROVIDER_NANO_BANANA_KEY \
  --image-model gpt-image-2 \
  --chat-model gpt-5.5 \
  --set-primary
```

3. Optional: fetch upstream model ids.

```bash
python3 scripts/configure_provider.py \
  --id nano-banana \
  --name "Nano Banana" \
  --base-url "https://api.example.com/v1" \
  --protocol openai \
  --api-key-env API_PROVIDER_NANO_BANANA_KEY \
  --fetch-models
```

4. Start the app and open API Settings. The provider should appear in the platform list, and the Agent setup block should show the matching command and env var.

## Safe Key Input

Prefer `--api-key-env`. Use `--api-key-stdin` when the key should not appear in shell history:

```bash
printf '%s' "$API_PROVIDER_NANO_BANANA_KEY" | python3 scripts/configure_provider.py \
  --id nano-banana \
  --name "Nano Banana" \
  --base-url "https://api.example.com/v1" \
  --api-key-stdin
```

The CLI masks key output and never prints the full key.

Remote provider URLs must use `https://`. The CLI and backend only accept plain `http://` for local development endpoints such as `localhost` or `127.0.0.1`, so an agent does not accidentally send API keys to a remote plaintext endpoint.

When validating, pulling models, or probing APIMart async support with a saved key, the backend will only send that key to the provider's saved `base_url`. To test a changed or unsaved URL, provide a transient key in the form or CLI instead of reusing a saved key.

If a saved provider already has a key and its `base_url` changes, the backend rejects the save unless a new key is submitted at the same time. If the key comes from an explicit process environment variable, use a new provider ID or update that environment variable before changing the URL.

## Files Written

- `data/api_providers.json`: provider metadata.
- `API/.env`: local secrets.

Both are ignored by git. `API/.env` is written with secret-file permissions by the app and CLI. Commit `API/.env.example` and docs, not real local config.

## Validation

```bash
python3 tests/test_agent_provider_config.py -v
python3 tests/test_sidebar_pin_static.py -v
.venv/bin/python tests/test_runtime_env_values.py -v
```

For a live provider, also test from the UI:

- API Settings -> select provider -> Verify URL.
- Pull Models -> choose one image/chat/video model -> Save.
- Online Image or Canvas -> select the provider/model.
