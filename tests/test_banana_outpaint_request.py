import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("infinite_canvas_main", ROOT / "main.py")
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


class FakeResponse:
    status_code = 200
    text = ""
    reason_phrase = "OK"

    def raise_for_status(self):
        return None

    def json(self):
        return {"data": [{"url": "https://example.invalid/out.png"}]}


class FakeAsyncClient:
    last_post = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        FakeAsyncClient.last_post = {"url": url, **kwargs}
        return FakeResponse()


class BananaOutpaintRequestTests(unittest.TestCase):
    def test_openai_compatible_banana_edit_sends_supported_aspect_ratio(self):
        provider = {
            "id": "custom-api",
            "name": "comfly",
            "base_url": "https://ai.comfly.org",
            "protocol": "openai",
            "image_request_mode": "openai",
            "api_key": "test-key",
            "model_protocols": {},
        }
        reference = [{"url": "/assets/input/source.png", "name": "source.png", "role": "source"}]
        with (
            patch.object(APP, "get_api_provider", return_value=provider),
            patch.object(APP, "output_file_from_url", return_value=str(__file__)),
            patch.object(APP.httpx, "AsyncClient", FakeAsyncClient),
        ):
            asyncio.run(APP.generate_ai_image(
                "Remove white area and fill the scene",
                "3840x1648",
                "high",
                "nano-banana-pro-4k",
                reference,
                "custom-api",
            ))

        data = FakeAsyncClient.last_post["data"]
        self.assertEqual(data["aspect_ratio"], "21:9")
        self.assertEqual(data["image_size"], "4K")

    def test_every_outpaint_preset_maps_to_a_supported_gemini_ratio(self):
        allowed = {item[2] for item in APP.GEMINI_IMAGE_ASPECT_RATIOS}
        for preset in ("1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21"):
            with self.subTest(preset=preset):
                self.assertIn(APP.gemini_supported_aspect_ratio(preset), allowed)

    def test_image_2_request_does_not_receive_banana_only_fields(self):
        provider = {
            "id": "custom-api",
            "name": "comfly",
            "base_url": "https://ai.comfly.org",
            "protocol": "openai",
            "image_request_mode": "openai",
            "api_key": "test-key",
            "model_protocols": {},
        }
        reference = [{"url": "/assets/input/source.png", "name": "source.png", "role": "source"}]
        with (
            patch.object(APP, "get_api_provider", return_value=provider),
            patch.object(APP, "output_file_from_url", return_value=str(__file__)),
            patch.object(APP.httpx, "AsyncClient", FakeAsyncClient),
        ):
            asyncio.run(APP.generate_ai_image(
                "Expand the image",
                "1536x1024",
                "high",
                "gpt-image-2",
                reference,
                "custom-api",
            ))

        data = FakeAsyncClient.last_post["data"]
        self.assertNotIn("aspect_ratio", data)
        self.assertNotIn("image_size", data)


if __name__ == "__main__":
    unittest.main()
