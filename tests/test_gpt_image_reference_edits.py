import asyncio
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import main


class FakeImageResponse:
    status_code = 200
    text = '{"data":[{"b64_json":"ok"}]}'

    def __init__(self):
        self._image = base64.b64encode(b"fake image").decode("ascii")

    def raise_for_status(self):
        return None

    def json(self):
        return {"data": [{"b64_json": self._image}], "id": "req_test"}


class CapturingAsyncClient:
    def __init__(self, calls, *args, **kwargs):
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return FakeImageResponse()


class GptImageReferenceEditsTest(unittest.TestCase):
    def test_gpt_image_2_reference_images_use_edits_multipart(self):
        original_providers_file = main.API_PROVIDERS_FILE
        original_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        calls = []
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                providers_file = root / "data" / "api_providers.json"
                env_file = root / "API" / ".env"
                image_file = root / "input.png"
                providers_file.parent.mkdir()
                env_file.parent.mkdir()
                image_file.write_bytes(b"\x89PNG\r\n\x1a\n")
                providers_file.write_text(
                    json.dumps(
                        [
                            {
                                "id": "vt-260518",
                                "name": "VT-260518",
                                "base_url": "https://api.vectorengine.ai/v1",
                                "protocol": "openai",
                                "enabled": True,
                                "primary": True,
                                "image_models": ["gpt-image-2"],
                                "chat_models": [],
                                "video_models": [],
                                "ms_loras": [],
                                "ms_defaults_version": 0,
                            }
                        ]
                    ),
                    encoding="utf-8",
                )
                env_file.write_text("API_PROVIDER_VT_260518_KEY" + "=test-value\n", encoding="utf-8")
                main.API_PROVIDERS_FILE = str(providers_file)
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {}

                with mock.patch.object(main, "output_file_from_url", return_value=str(image_file)):
                    with mock.patch.object(
                        main.httpx,
                        "AsyncClient",
                        lambda *args, **kwargs: CapturingAsyncClient(calls, *args, **kwargs),
                    ):
                        image, raw = asyncio.run(
                            main.generate_ai_image(
                                "describe this",
                                "1024x1024",
                                "low",
                                "gpt-image-2",
                                [{"url": "/assets/input/test.png", "name": "test.png"}],
                                "vt-260518",
                            )
                        )

                self.assertEqual(image["type"], "b64")
                self.assertEqual(raw["id"], "req_test")
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0]["url"], "https://api.vectorengine.ai/v1/images/edits")
                self.assertIsNone(calls[0].get("json"))
                self.assertEqual(calls[0]["data"]["model"], "gpt-image-2")
                self.assertEqual(calls[0]["data"]["prompt"], "describe this")
                self.assertEqual(calls[0]["data"]["quality"], "low")
                self.assertIn("image[]", [item[0] for item in calls[0]["files"]])
        finally:
            main.API_PROVIDERS_FILE = original_providers_file
            main.API_ENV_FILE = original_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap


if __name__ == "__main__":
    unittest.main()
