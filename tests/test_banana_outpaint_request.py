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
            patch.object(APP, "api_headers", return_value={}),
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
        self.assertEqual(data["model"], "nano-banana-pro-4k")
        self.assertEqual(data["size"], "3840x1648")
        self.assertEqual(data["aspect_ratio"], "21:9")
        self.assertNotIn("image_size", data)

    def test_every_outpaint_preset_maps_to_a_supported_gemini_ratio(self):
        allowed = {item[2] for item in APP.GEMINI_IMAGE_ASPECT_RATIOS}
        for preset in ("1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21"):
            with self.subTest(preset=preset):
                self.assertIn(APP.gemini_supported_aspect_ratio(preset), allowed)

    def test_route_uses_base_banana_family_and_size_parameters(self):
        provider = {
            "image_models": [
                "nano-banana-2", "nano-banana-2-2k", "nano-banana-2-4k",
                "nano-banana-pro", "nano-banana-pro-2k", "nano-banana-pro-4k",
            ]
        }
        cases = (
            ("nano-banana-pro-4k", "1024x1024", "nano-banana-pro", "1:1"),
            ("nano-banana-pro-4k", "2048x2048", "nano-banana-pro-2k", "1:1"),
            ("nano-banana-pro-2k", "4096x2304", "nano-banana-pro-4k", "16:9"),
            ("nano-banana-2-2k", "3840x1648", "nano-banana-2-4k", "21:9"),
        )
        for requested, size, expected_model, expected_ratio in cases:
            with self.subTest(requested=requested, size=size):
                route = APP.route_openai_image_request(provider, requested, size)
                self.assertEqual(route["model"], expected_model)
                self.assertEqual(route["params"]["aspect_ratio"], expected_ratio)
                self.assertNotIn("image_size", route["params"])

    def test_route_falls_back_to_base_when_resolution_alias_is_unavailable(self):
        provider = {"image_models": ["nano-banana-pro"]}
        route = APP.route_openai_image_request(provider, "nano-banana-pro-2k", "4096x2304")
        self.assertEqual(route["model"], "nano-banana-pro")
        self.assertNotIn("image_size", route["params"])

    def test_openai_gateway_gemini_image_id_receives_image_parameters(self):
        route = APP.route_openai_image_request({}, "gemini-3-pro-image-preview", "1536x1024")
        self.assertEqual(route["model"], "gemini-3-pro-image-preview")
        self.assertEqual(route["params"], {"aspect_ratio": "3:2"})

    def test_unrelated_image_model_is_not_routed(self):
        route = APP.route_openai_image_request({}, "flux-kontext-pro", "1536x1024")
        self.assertEqual(route["model"], "flux-kontext-pro")
        self.assertEqual(route["params"], {})

    def test_text_to_image_request_uses_routed_model_and_parameters(self):
        provider = {
            "id": "custom-api",
            "name": "comfly",
            "base_url": "https://ai.comfly.org",
            "protocol": "openai",
            "image_request_mode": "openai",
            "api_key": "test-key",
            "model_protocols": {},
            "image_models": ["nano-banana-2", "nano-banana-2-2k", "nano-banana-2-4k"],
        }
        with (
            patch.object(APP, "get_api_provider", return_value=provider),
            patch.object(APP, "api_headers", return_value={}),
            patch.object(APP.httpx, "AsyncClient", FakeAsyncClient),
        ):
            asyncio.run(APP.generate_ai_image(
                "A panoramic orchard",
                "4096x2304",
                "high",
                "nano-banana-2-2k",
                [],
                "custom-api",
            ))

        body = FakeAsyncClient.last_post["json"]
        self.assertEqual(body["model"], "nano-banana-2-4k")
        self.assertEqual(body["aspect_ratio"], "16:9")
        self.assertEqual(body["size"], "4096x2304")
        self.assertNotIn("image_size", body)

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
            patch.object(APP, "api_headers", return_value={}),
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
