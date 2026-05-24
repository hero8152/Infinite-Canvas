import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import main  # noqa: E402


class ProviderModelSaveTests(unittest.TestCase):
    def test_model_list_update_preserves_provider_fields(self):
        original_data_dir = main.DATA_DIR
        original_providers_file = main.API_PROVIDERS_FILE
        original_env_file = main.API_ENV_FILE
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            data_dir.mkdir()
            providers_file = data_dir / "api_providers.json"
            env_file = Path(tmp) / ".env"
            provider = {
                "id": "custom",
                "name": "Custom Provider",
                "base_url": "https://example.invalid/v1",
                "protocol": "openai",
                "image_generation_endpoint": "/v1/images/generations",
                "image_edit_endpoint": "/v1/images/edits",
                "enabled": True,
                "primary": True,
                "image_models": ["old-image"],
                "chat_models": ["old-chat"],
                "video_models": [],
                "ms_loras": [{
                    "id": "keep-me",
                    "target_model": "old-image",
                    "strength": 0.7,
                    "enabled": True,
                    "note": "preserve",
                }],
                "ms_defaults_version": 3,
            }
            providers_file.write_text(json.dumps([provider], ensure_ascii=False), encoding="utf-8")
            main.DATA_DIR = str(data_dir)
            main.API_PROVIDERS_FILE = str(providers_file)
            main.API_ENV_FILE = str(env_file)
            try:
                payload = main.ApiProviderModelsPayload(
                    image_models=["new-image", "new-image"],
                    chat_models=["new-chat"],
                    video_models=["new-video"],
                )
                result = asyncio.run(main.save_provider_models("custom", payload))
                saved_providers = json.loads(providers_file.read_text(encoding="utf-8"))
                saved_provider = next(item for item in saved_providers if item["id"] == "custom")
            finally:
                main.DATA_DIR = original_data_dir
                main.API_PROVIDERS_FILE = original_providers_file
                main.API_ENV_FILE = original_env_file

        self.assertEqual(saved_provider["name"], "Custom Provider")
        self.assertEqual(saved_provider["base_url"], "https://example.invalid/v1")
        self.assertEqual(saved_provider["protocol"], "openai")
        self.assertEqual(saved_provider["image_generation_endpoint"], "/v1/images/generations")
        self.assertEqual(saved_provider["image_edit_endpoint"], "/v1/images/edits")
        self.assertEqual(saved_provider["ms_loras"][0]["id"], "keep-me")
        self.assertEqual(saved_provider["ms_loras"][0]["target_model"], "old-image")
        self.assertEqual(saved_provider["ms_loras"][0]["strength"], 0.7)
        self.assertEqual(saved_provider["image_models"], ["new-image"])
        self.assertEqual(saved_provider["chat_models"], ["new-chat"])
        self.assertEqual(saved_provider["video_models"], ["new-video"])
        self.assertEqual(result["provider"]["name"], "Custom Provider")


if __name__ == "__main__":
    unittest.main()
