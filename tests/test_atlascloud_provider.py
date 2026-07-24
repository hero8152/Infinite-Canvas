import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class AtlasCloudProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.providers_file = self.root / "api_providers.json"
        self.api_env_file = self.root / ".env"
        self.patches = [
            patch.object(main, "API_PROVIDERS_FILE", str(self.providers_file)),
            patch.object(main, "API_ENV_FILE", str(self.api_env_file)),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def atlas_provider(self):
        providers = main.load_api_providers()
        return next(item for item in providers if item["id"] == "atlascloud")

    def test_default_provider_is_registered_for_chat_models(self):
        provider = self.atlas_provider()

        self.assertEqual(provider["name"], "Atlas Cloud")
        self.assertEqual(provider["base_url"], "https://api.atlascloud.ai/v1")
        self.assertEqual(provider["protocol"], "openai")
        self.assertEqual(provider["chat_models"][:2], ["qwen/qwen3.5-flash", "deepseek-ai/deepseek-v4-pro"])
        self.assertEqual(provider["image_models"], [])
        self.assertEqual(provider["video_models"], [])
        self.assertEqual(main.public_provider(provider)["key_env"], "ATLASCLOUD_API_KEY")

    def test_existing_atlas_provider_keeps_custom_models_with_safe_defaults(self):
        self.providers_file.write_text(
            json.dumps([
                {
                    "id": "atlascloud",
                    "name": "Atlas",
                    "base_url": "",
                    "protocol": "openai",
                    "chat_models": ["custom/atlas-model"],
                    "image_models": [],
                    "video_models": [],
                }
            ]),
            encoding="utf-8",
        )

        provider = self.atlas_provider()

        self.assertEqual(provider["base_url"], "https://api.atlascloud.ai/v1")
        self.assertEqual(provider["chat_models"], [
            "qwen/qwen3.5-flash",
            "deepseek-ai/deepseek-v4-pro",
            "custom/atlas-model",
        ])

    def test_api_key_aliases_are_used_for_openai_compatible_chat(self):
        with patch.dict(os.environ, {"ATLASCLOUD_API_KEY": "", "ATLAS_CLOUD_API_KEY": "alias-token"}, clear=False):
            self.assertEqual(main.provider_env_key_value("atlascloud"), "alias-token")
            base, headers, model = main.resolve_chat_provider("atlascloud", "", "")

        self.assertEqual(base, "https://api.atlascloud.ai/v1")
        self.assertEqual(model, "qwen/qwen3.5-flash")
        self.assertEqual(headers["Authorization"], "Bearer alias-token")

    def test_api_env_file_supports_atlas_cloud_alias(self):
        self.api_env_file.write_text("ATLAS_CLOUD_API_KEY=file-alias\n", encoding="utf-8")

        with patch.dict(os.environ, {"ATLASCLOUD_API_KEY": "", "ATLAS_CLOUD_API_KEY": ""}, clear=False):
            self.assertEqual(main.provider_env_key_value("atlascloud"), "file-alias")


if __name__ == "__main__":
    unittest.main()
