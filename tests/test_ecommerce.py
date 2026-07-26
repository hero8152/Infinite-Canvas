import asyncio
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from PIL import Image
from canvas_core.database import CanvasDatabase

from canvas_core.ecommerce import (
    QUALITY_CHECKS,
    build_universal_auto_instruction,
    build_model_catalog,
    build_prompt,
    parse_garment_analysis,
    parse_universal_reference_analysis,
    public_capabilities,
    resolve_generation_settings,
    route_candidates,
    safe_fallback_error,
    target_size,
    validate_input_roles,
)


class EcommerceContractTests(unittest.TestCase):
    def setUp(self):
        self.providers = [
            {
                "id": "modelscope",
                "name": "ModelScope",
                "enabled": True,
                "primary": False,
                "image_models": ["Qwen/Qwen-Image-Edit-2511", "black-forest-labs/FLUX.2-klein-9B"],
            },
            {
                "id": "grsai",
                "name": "Grsai",
                "enabled": True,
                "primary": True,
                "image_models": ["nano-banana-fast", "gpt-image-2-vip", "text-only-model"],
            },
            {
                "id": "disabled",
                "enabled": False,
                "image_models": ["Qwen-Image-Edit-2511"],
            },
        ]

    def test_standard_route_uses_single_quality_priority(self):
        catalog = build_model_catalog(self.providers)
        self.assertEqual(route_candidates(catalog, "standard")[0]["model"], "gpt-image-2-vip")
        self.assertEqual(route_candidates(catalog, "preview")[0]["model"], "gpt-image-2-vip")
        self.assertEqual(route_candidates(catalog, "publish")[0]["model"], "gpt-image-2-vip")
        self.assertNotIn("text-only-model", [item["model"] for item in catalog])
        self.assertNotIn("disabled", [item["provider_id"] for item in catalog])

    def test_same_model_prefers_primary_provider(self):
        providers = [
            {"id": "first", "enabled": True, "primary": False, "image_models": ["gpt-image-2-vip"]},
            {"id": "preferred", "enabled": True, "primary": True, "image_models": ["gpt-image-2-vip"]},
        ]
        routes = route_candidates(build_model_catalog(providers), "standard", model="gpt-image-2-vip")
        self.assertEqual(routes[0]["provider_id"], "preferred")

    def test_gemini_3_and_nano_banana_pro_accept_fourteen_references(self):
        providers = [{
            "id": "image-provider",
            "enabled": True,
            "image_models": ["gemini-3-pro-image-preview", "nano-banana-pro-4k-vip", "nano-banana-fast"],
        }]
        limits = {item["model"]: item["max_reference_images"] for item in build_model_catalog(providers)}
        self.assertEqual(limits["gemini-3-pro-image-preview"], 14)
        self.assertEqual(limits["nano-banana-pro-4k-vip"], 14)
        self.assertEqual(limits["nano-banana-fast"], 3)

    def test_roles_prompts_and_target_resolution(self):
        try_on_inputs = [
            {"role": "source", "url": "/assets/input/person.png"},
            {"role": "garment", "url": "/assets/input/top.png"},
        ]
        self.assertEqual(len(validate_input_roles("try_on", try_on_inputs)), 2)
        prompt = build_prompt("try_on", try_on_inputs, {"garment_category": "upper"})
        self.assertIn("Change only the requested dimension", prompt)
        self.assertIn("logo", prompt.lower())
        self.assertEqual(target_size(1600, 900, "standard"), "2048x1152")
        self.assertEqual(target_size(900, 1600, "standard"), "1152x2048")
        self.assertEqual(target_size(900, 1600, "preview", "4:5", "1k"), "1024x1280")
        self.assertEqual(target_size(900, 1600, "publish", "4:5", "2k"), "1632x2040")
        with self.assertRaises(ValueError):
            validate_input_roles("pose_transfer", [{"role": "source", "url": "/assets/input/person.png"}], {"pose_source": "reference"})
        with self.assertRaises(ValueError):
            validate_input_roles("background_change", [{"role": "source", "url": "/assets/input/product.png"}], {"background_mode": "reference"})

    def test_generation_parameter_defaults_and_overrides(self):
        standard = resolve_generation_settings(1600, 900, "standard")
        self.assertEqual((standard["size"], standard["quality"], standard["count"]), ("2048x1152", "high", 1))
        custom = resolve_generation_settings(1600, 900, "standard", "4:5", "4k", "low", 3)
        self.assertEqual(custom["size"], "2560x3200")
        self.assertEqual(custom["resolution"], "4k")
        self.assertEqual(custom["quality"], "low")
        self.assertEqual(custom["count"], 3)
        with self.assertRaises(ValueError):
            resolve_generation_settings(1600, 900, "preview", "5:7")

    def test_universal_prompt_assigns_each_reference_an_exclusive_role(self):
        references = [
            {"reference_id": "model", "reference_type": "subject", "role": "subject", "url": "/assets/input/1.png", "label": "模特"},
            {"reference_id": "outfit", "reference_type": "full_garment", "role": "full_garment", "url": "/assets/input/2.png", "label": "蓝色连衣裙"},
            {"reference_id": "shoes", "reference_type": "shoes", "role": "shoes", "url": "/assets/input/3.png", "label": "运动鞋"},
            {"reference_id": "necklace", "reference_type": "accessory", "role": "accessory", "url": "/assets/input/4.png", "label": "项链"},
            {"reference_id": "pose", "reference_type": "pose", "role": "pose", "url": "/assets/input/5.png"},
            {"reference_id": "scene", "reference_type": "scene", "role": "scene", "url": "/assets/input/6.png"},
        ]
        prompt = build_prompt("universal", references, {})
        for index in range(1, 7):
            self.assertIn(f"Image {index} =", prompt)
        self.assertIn("AUTO FINAL COMPOSITION", prompt)
        self.assertIn("Dress the model in the exact full outfit or dress from Image 2", prompt)
        self.assertIn("Put the exact shoes from Image 3", prompt)
        self.assertIn("Have the model wear the exact item from Image 4", prompt)
        self.assertIn("Place the model and products inside the scene from Image 6", prompt)
        self.assertIn("REFERENCE OWNERSHIP RULES", prompt)
        self.assertIn("never copy their identity", prompt)
        self.assertIn("CONFLICT PRIORITY", prompt)
        self.assertTrue(QUALITY_CHECKS["universal"])

    def test_universal_auto_instruction_chooses_prop_interactions(self):
        references = [
            {"reference_id": "model", "reference_type": "subject", "role": "subject", "url": "/assets/input/1.png", "label": "模特"},
            {"reference_id": "bag", "reference_type": "accessory", "role": "accessory", "url": "/assets/input/2.png", "label": "黑色手提包"},
            {"reference_id": "phone", "reference_type": "prop", "role": "prop", "url": "/assets/input/3.png", "label": "手机"},
            {"reference_id": "chair", "reference_type": "prop", "role": "prop", "url": "/assets/input/4.png", "label": "木椅"},
        ]
        auto = build_universal_auto_instruction(references, {})
        self.assertIn("naturally carry the exact item from Image 2", auto)
        self.assertIn("naturally hold the exact item from Image 3", auto)
        self.assertIn("Place the exact item from Image 4", auto)
        analysis = parse_universal_reference_analysis('{"item_name":"银色项链","category":"项链","interaction":"wear","visual_details":"细链条","confidence":0.91}')
        self.assertEqual(analysis["interaction"], "wear")
        prompt = build_prompt("universal", references[:2], {"reference_analysis": {"bag": {"item_name": "亮面黑色手提包", "interaction": "carry"}}})
        self.assertIn("亮面黑色手提包", prompt)

    def test_universal_requires_subject_and_at_most_fourteen_images(self):
        subject = {"reference_id": "model", "reference_type": "subject", "role": "subject", "url": "/assets/input/1.png"}
        self.assertEqual(validate_input_roles("universal", [subject], {})[0]["reference_type"], "subject")
        with self.assertRaisesRegex(ValueError, "主体"):
            validate_input_roles("universal", [{"reference_type": "pose", "role": "pose", "url": "/assets/input/2.png"}], {})
        too_many = [dict(subject, reference_id=f"r{index}") for index in range(15)]
        with self.assertRaisesRegex(ValueError, "最多上传 14"):
            validate_input_roles("universal", too_many, {})

    def test_capabilities_do_not_expose_provider_secrets(self):
        providers = [dict(self.providers[0], api_key="secret", key_preview="abcd")]
        capabilities = public_capabilities(providers)
        self.assertEqual(capabilities["modes"], ["standard"])
        self.assertEqual(capabilities["defaults"]["standard"]["count"], 1)
        self.assertEqual(capabilities["defaults"]["standard"]["resolution"], "2k")
        self.assertTrue(capabilities["quality_checks"]["try_on"])
        self.assertNotIn("api_key", str(capabilities))
        self.assertNotIn("secret", str(capabilities))
        self.assertEqual(capabilities["universal_reference_limit"], 14)
        self.assertTrue(capabilities["universal_reference_roles"])

    def test_only_explicit_unsupported_errors_allow_route_fallback(self):
        self.assertTrue(safe_fallback_error(405, "Method Not Allowed"))
        self.assertTrue(safe_fallback_error(400, "model is unsupported"))
        self.assertFalse(safe_fallback_error(502, "timeout"))
        self.assertFalse(safe_fallback_error(400, "insufficient balance"))

    def test_garment_analysis_normalizes_local_vision_json(self):
        analysis = parse_garment_analysis('```json\n{"category":"上装","garment_type":"短袖 T 恤","confidence":0.93,"reason":"短袖圆领"}\n```')
        self.assertEqual(analysis["category"], "upper")
        self.assertEqual(analysis["garment_type"], "短袖 T 恤")
        self.assertEqual(analysis["confidence"], 0.93)


class EcommerceBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import main
        cls.main = main

    def make_image(self, path: Path, size=(100, 80), image_format="PNG"):
        Image.new("RGB", size, "white").save(path, image_format)

    def test_provider_list_keeps_grsai_and_adds_shiying_and_vision_presets(self):
        class FakeDatabase:
            def load_providers(self):
                return [
                    {"id": "modelscope", "name": "ModelScope", "enabled": True, "image_models": ["Qwen-Image-Edit-2511"]},
                    {"id": "grsai", "name": "Grsai", "base_url": "https://grsaiapi.com", "enabled": True, "image_models": ["gpt-image-2-vip"]},
                    {"id": "lingjing", "name": "灵境", "enabled": True, "image_models": ["gpt-image-2"]},
                ]

        with patch.object(self.main, "DATABASE", FakeDatabase()):
            providers = self.main.load_api_providers()
        self.assertEqual([item["id"] for item in providers], ["grsai", "shiying", "local-vision"])
        self.assertIn("gpt-image-2-vip", providers[0]["image_models"])
        self.assertEqual(providers[1]["base_url"], "https://www.shiying-api.com")
        self.assertEqual(providers[1]["model_protocols"]["gemini-3-pro-image-preview"], "gemini")
        self.assertEqual(providers[2]["chat_models"], ["qwen3.5-9b-vlm"])
        self.assertEqual(providers[2]["image_models"], [])

    def test_local_vision_url_auto_completion(self):
        cases = {
            "115.231.35.105:12345": "http://115.231.35.105:12345/v1",
            "localhost:8000": "http://localhost:8000/v1",
            "vision.example.com": "https://vision.example.com/v1",
            "vision.example.com:8443": "https://vision.example.com:8443/v1",
            "https://vision.example.com/openai/v1/": "https://vision.example.com/openai/v1",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(self.main.normalize_openai_compatible_base_url(raw), expected)
        with self.assertRaises(self.main.HTTPException):
            self.main.normalize_openai_compatible_base_url("https://user:pass@example.com")

    def test_builtin_local_vision_key_is_seeded_only_once(self):
        class FakeDatabase:
            def __init__(self, done=False):
                self.done = done
                self.saved = None

            def get_setting(self, key, default):
                return {"value": {"done": self.done}}

            def save_setting(self, key, value, only_if_empty=False):
                self.saved = (key, value, only_if_empty)

        updates = []
        fake = FakeDatabase()
        with (
            patch.object(self.main, "DATABASE", fake),
            patch.object(self.main, "provider_env_key_value", return_value=""),
            patch.object(self.main, "update_env_values", side_effect=lambda value: updates.append(value)),
        ):
            result = self.main.seed_builtin_local_vision_secret_once()
        self.assertTrue(result["seeded"])
        self.assertEqual(updates[0][self.main.provider_key_env("local-vision")], self.main.LOCAL_VISION_BUILTIN_API_KEY)
        self.assertTrue(fake.saved[1]["done"])

        with (
            patch.object(self.main, "DATABASE", FakeDatabase(done=True)),
            patch.object(self.main, "update_env_values") as update,
        ):
            result = self.main.seed_builtin_local_vision_secret_once()
        self.assertTrue(result["skipped"])
        update.assert_not_called()

    def test_ecommerce_capabilities_only_include_configured_provider(self):
        providers = [
            {"id": "grsai", "name": "Grsai", "enabled": True, "image_models": ["gpt-image-2-vip"]},
            {"id": "missing-key", "name": "Missing", "enabled": True, "image_models": ["gpt-image-2"]},
        ]
        with (
            patch.object(self.main, "load_api_providers", return_value=providers),
            patch.object(self.main, "provider_env_key_value", side_effect=lambda provider_id: "configured" if provider_id == "grsai" else ""),
        ):
            capabilities = asyncio.run(self.main.get_ecommerce_capabilities())
        self.assertEqual(capabilities["providers"], [{"id": "grsai", "name": "Grsai"}])
        self.assertTrue(capabilities["models"])
        self.assertEqual({item["provider_id"] for item in capabilities["models"]}, {"grsai"})

    def test_ecommerce_task_rejects_provider_without_api_key_before_queueing(self):
        provider = {"id": "grsai", "name": "Grsai", "enabled": True, "image_models": ["gpt-image-2-vip"]}
        payload = self.main.EcommerceTaskRequest(
            operation="angle_change",
            mode="standard",
            inputs=[self.main.AIReference(role="source", url="/assets/input/source.png")],
        )
        with (
            patch.object(self.main, "load_api_providers", return_value=[provider]),
            patch.object(self.main, "provider_env_key_value", return_value=""),
            patch.object(self.main, "validate_ecommerce_local_inputs", return_value=([{"role": "source", "url": "/assets/input/source.png"}], (100, 100))),
        ):
            with self.assertRaises(self.main.HTTPException) as error:
                self.main.prepare_ecommerce_request(payload)
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("没有找到兼容", error.exception.detail)

    def test_ecommerce_task_applies_selected_generation_parameters(self):
        provider = {"id": "shiying", "name": "shiying", "enabled": True, "image_models": ["gemini-3-pro-image-preview"]}
        payload = self.main.EcommerceTaskRequest(
            operation="angle_change",
            mode="standard",
            inputs=[self.main.AIReference(role="source", url="/assets/input/source.png")],
            provider_id="shiying",
            model="gemini-3-pro-image-preview",
            aspect_ratio="4:5",
            resolution="2k",
            quality="high",
            count=3,
        )
        with (
            patch.object(self.main, "configured_ecommerce_providers", return_value=[provider]),
            patch.object(self.main, "validate_ecommerce_local_inputs", return_value=([{"role": "source", "url": "/assets/input/source.png"}], (900, 1600))),
        ):
            snapshot = self.main.prepare_ecommerce_request(payload)
        self.assertEqual(snapshot["size"], "1632x2040")
        self.assertEqual(snapshot["aspect_ratio"], "4:5")
        self.assertEqual(snapshot["resolution"], "2k")
        self.assertEqual(snapshot["quality"], "high")
        self.assertEqual(snapshot["count"], 3)
        self.assertEqual(snapshot["parameters"], {"aspect_ratio": "4:5", "resolution": "2k", "quality": "high", "count": 3})
    def test_removed_provider_presets_are_pruned_once(self):
        class FakeDatabase:
            def __init__(self):
                self.saved = None
                self.marker = None

            def get_setting(self, key, default):
                return default

            def load_providers(self):
                return [
                    {"id": "modelscope"},
                    {"id": "grsai"},
                    {"id": "lingjing"},
                    {"id": "custom-provider"},
                ]

            def save_providers(self, providers):
                self.saved = list(providers)

            def save_setting(self, key, value, only_if_empty=False):
                self.marker = (key, value, only_if_empty)

        fake = FakeDatabase()
        with patch.object(self.main, "DATABASE", fake):
            report = self.main.prune_removed_provider_presets_once()
        self.assertEqual(report["removed"], ["modelscope", "lingjing"])
        self.assertEqual([item["id"] for item in fake.saved], ["grsai", "custom-provider"])
        self.assertTrue(fake.marker[1]["done"])

    def test_local_inputs_reject_mismatched_mask_dimensions(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.png"
            mask = Path(root) / "mask.png"
            self.make_image(source, (100, 80))
            self.make_image(mask, (99, 80))
            lookup = {"/assets/input/source.png": str(source), "/assets/input/mask.png": str(mask)}
            inputs = [
                {"role": "source", "url": "/assets/input/source.png"},
                {"role": "mask", "url": "/assets/input/mask.png"},
            ]
            with patch.object(self.main, "output_file_from_url", side_effect=lambda url: lookup.get(url)):
                with self.assertRaises(self.main.HTTPException) as error:
                    self.main.validate_ecommerce_local_inputs(inputs)
            self.assertEqual(error.exception.status_code, 400)
            self.assertIn("蒙版尺寸", error.exception.detail)

    def test_local_inputs_accept_mpo_as_jpeg(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.png"
            garment = Path(root) / "garment.jpg"
            self.make_image(source)
            first = Image.new("RGB", (100, 80), "red")
            second = Image.new("RGB", (100, 80), "blue")
            first.save(garment, "MPO", save_all=True, append_images=[second])
            lookup = {"/assets/input/source.png": str(source), "/assets/input/garment.jpg": str(garment)}
            inputs = [
                {"role": "source", "url": "/assets/input/source.png"},
                {"role": "garment", "url": "/assets/input/garment.jpg"},
            ]
            with patch.object(self.main, "output_file_from_url", side_effect=lambda url: lookup.get(url)):
                checked, dimensions = self.main.validate_ecommerce_local_inputs(inputs)
            self.assertEqual(dimensions, (100, 80))
            self.assertEqual(checked[1]["mime"], "image/jpeg")

    def test_ecommerce_vision_route_prefers_local_vlm(self):
        providers = [
            {"id": "chat", "name": "Chat", "enabled": True, "chat_models": ["qwen3.5-9b-vlm"]},
            {"id": "local-vision", "name": "本地视觉模型", "enabled": True, "chat_models": ["qwen3.5-9b-vlm"]},
        ]
        with patch.object(self.main, "provider_env_key_value", return_value="configured"):
            route = self.main.configured_ecommerce_vision_route(providers)
        self.assertEqual(route["provider_id"], "local-vision")

    def test_universal_vision_analysis_runs_in_parallel_and_reuses_cache(self):
        with tempfile.TemporaryDirectory() as root:
            paths = []
            for index in range(3):
                path = Path(root) / f"ref-{index}.png"
                self.make_image(path)
                paths.append(path)
            inputs = [
                {"reference_id": f"ref-{index}", "reference_type": "prop", "role": "prop", "url": f"/assets/input/ref-{index}.png"}
                for index in range(3)
            ]
            active = 0
            max_active = 0

            async def caption(*args, **kwargs):
                nonlocal active, max_active
                active += 1
                max_active = max(max_active, active)
                await asyncio.sleep(0.02)
                active -= 1
                return '{"item_name":"商品","category":"道具","interaction":"hold"}', "qwen3.5-9b-vlm"

            self.main.ECOMMERCE_VISION_CACHE.clear()
            route = {"provider_id": "local-vision", "provider_name": "本地视觉模型", "model": "qwen3.5-9b-vlm"}
            mocked_caption = AsyncMock(side_effect=caption)
            with (
                patch.object(self.main, "configured_ecommerce_vision_route", return_value=route),
                patch.object(self.main, "output_file_from_url", side_effect=lambda url: str(paths[int(re.search(r"(\d+)", url).group(1))])),
                patch.object(self.main, "caption_image_with_provider", mocked_caption),
            ):
                first = asyncio.run(self.main.analyze_ecommerce_universal_references(inputs))
                second = asyncio.run(self.main.analyze_ecommerce_universal_references(inputs))
            self.assertEqual(first["succeeded"], 3)
            self.assertGreaterEqual(max_active, 2)
            self.assertEqual(mocked_caption.await_count, 3)
            self.assertTrue(all(item.get("cached") for item in second["items"].values()))

    def test_auto_garment_analysis_enriches_prompt(self):
        snapshot = {
            "operation": "try_on",
            "inputs": [
                {"role": "source", "url": "/assets/input/source.png"},
                {"role": "garment", "url": "/assets/input/garment.jpg"},
            ],
            "options": {"garment_category": "auto"},
            "prompt": "before",
        }
        analysis = {"status": "succeeded", "category": "upper", "garment_type": "短袖 T 恤", "confidence": 0.96}
        with patch.object(self.main, "analyze_ecommerce_garment", new=AsyncMock(return_value=analysis)):
            enriched, returned = asyncio.run(self.main.enrich_ecommerce_snapshot_with_garment_analysis(snapshot))
        self.assertEqual(returned, analysis)
        self.assertEqual(enriched["options"]["garment_category"], "upper")
        self.assertIn("upper-body garment", enriched["prompt"])
        self.assertIn("短袖 T 恤", enriched["prompt"])

    def test_approval_requires_every_quality_check(self):
        task_id = "ecommerce_test_approval"
        self.main.ECOMMERCE_TASKS[task_id] = {
            "id": task_id,
            "operation": "try_on",
            "status": "succeeded",
            "result": {"images": ["/assets/output/result.png"]},
        }
        incomplete = self.main.EcommerceApprovalRequest(output_index=0, checks={"identity": True})
        with self.assertRaises(self.main.HTTPException) as error:
            asyncio.run(self.main.approve_ecommerce_task(task_id, incomplete))
        self.assertEqual(error.exception.status_code, 400)

        checks = {item["id"]: True for item in QUALITY_CHECKS["try_on"]}
        complete = self.main.EcommerceApprovalRequest(output_index=0, checks=checks)
        with patch.object(self.main, "update_ecommerce_task") as update:
            result = asyncio.run(self.main.approve_ecommerce_task(task_id, complete))
        self.assertEqual(result["approval"]["status"], "approved")
        self.assertEqual(update.call_args.args[1]["approval"]["output_url"], "/assets/output/result.png")
        self.main.ECOMMERCE_TASKS.pop(task_id, None)

    def test_export_is_blocked_until_approval_and_then_copies_official_file(self):
        task_id = "ecommerce_test_export"
        self.main.ECOMMERCE_TASKS[task_id] = {"id": task_id, "operation": "background_change", "approval": {"status": "pending"}}
        with self.assertRaises(self.main.HTTPException) as error:
            asyncio.run(self.main.export_ecommerce_task(task_id))
        self.assertEqual(error.exception.status_code, 409)

        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.png"
            exports = Path(root) / "exports"
            self.make_image(source)
            self.main.ECOMMERCE_TASKS[task_id]["approval"] = {
                "status": "approved",
                "output_url": "/assets/output/source.png",
                "export": None,
            }
            with (
                patch.object(self.main, "OUTPUT_DIR", str(exports)),
                patch.object(self.main, "output_file_from_url", side_effect=lambda url: str(source) if url == "/assets/output/source.png" else None),
                patch.object(self.main, "media_url_from_path", side_effect=lambda path: "/output/" + Path(path).relative_to(exports).as_posix()),
                patch.object(self.main, "update_ecommerce_task") as update,
            ):
                result = asyncio.run(self.main.export_ecommerce_task(task_id))
            self.assertEqual(result["export"]["kind"], "official")
            exported = list(exports.rglob("*.png"))
            self.assertEqual(len(exported), 1)
            self.assertTrue(update.called)
        self.main.ECOMMERCE_TASKS.pop(task_id, None)

    def test_publish_batch_makes_four_independent_calls_and_uses_semantic_mask(self):
        generated = AsyncMock(return_value=(
            {"type": "url", "value": "/assets/output/upstream.png"},
            {"data": []},
        ))
        saved_urls = iter([f"/assets/output/candidate-{index}.png" for index in range(4)])
        saved = AsyncMock(side_effect=lambda *args, **kwargs: next(saved_urls))
        with (
            patch.object(self.main, "get_api_provider", return_value={"id": "modelscope", "name": "ModelScope", "image_models": ["Qwen/Qwen-Image-Edit-2511"]}),
            patch.object(self.main, "generate_ai_image", generated),
            patch.object(self.main, "save_ai_image_to_output", saved),
            patch.object(self.main, "image_output_meta", side_effect=lambda url, item=None: {"url": url}),
        ):
            batch = asyncio.run(self.main.execute_ai_image_batch(
                prompt="edit",
                provider_id="modelscope",
                model="Qwen/Qwen-Image-Edit-2511",
                size="2048x2048",
                quality="high",
                references=[{"role": "source", "url": "/assets/input/source.png", "kind": "image"}],
                count=4,
                prefix="ecommerce_",
                allow_edit_endpoint_fallback=False,
                semantic_mask=True,
            ))
        self.assertEqual(generated.await_count, 4)
        self.assertEqual(len(batch["images"]), 4)
        self.assertTrue(all(call.kwargs["semantic_mask"] is True for call in generated.await_args_list))
        self.assertTrue(all(call.kwargs["allow_edit_endpoint_fallback"] is False for call in generated.await_args_list))

    def test_task_restore_marks_active_task_interrupted_without_resubmission(self):
        class FakeDatabase:
            def __init__(self):
                self.saved = []

            def load_tasks(self, kind):
                return [{"id": "ecommerce_running", "type": "ecommerce", "status": "running", "created_at": 1}]

            def save_tasks(self, kind, tasks):
                self.saved = list(tasks)

        fake = FakeDatabase()
        self.main.ECOMMERCE_TASKS.clear()
        with (
            patch.object(self.main, "DATABASE", fake),
            patch.object(self.main, "publish_entity_changed"),
        ):
            self.main.load_ecommerce_tasks_from_disk()
        restored = self.main.ECOMMERCE_TASKS["ecommerce_running"]
        self.assertEqual(restored["status"], "interrupted")
        self.assertIn("不会自动补发", restored["error"])
        self.assertEqual(fake.saved[0]["status"], "interrupted")
        self.main.ECOMMERCE_TASKS.clear()

    def test_batch_task_status_returns_lightweight_updates(self):
        self.main.ECOMMERCE_TASKS.clear()
        self.main.ECOMMERCE_TASKS.update({
            "ecommerce_a": {"id": "ecommerce_a", "status": "running", "updated_at": 2, "prompt": "large", "inputs": [{"url": "x"}]},
            "ecommerce_b": {"id": "ecommerce_b", "status": "succeeded", "updated_at": 3, "result": {"images": ["y"]}},
        })
        result = asyncio.run(self.main.ecommerce_task_status(self.main.EcommerceTaskStatusRequest(ids=["ecommerce_a", "ecommerce_b", "missing"])))
        self.assertEqual([item["id"] for item in result["tasks"]], ["ecommerce_a", "ecommerce_b"])
        self.assertEqual(result["missing"], ["missing"])
        self.assertNotIn("prompt", result["tasks"][0])
        self.assertNotIn("result", result["tasks"][1])
        self.main.ECOMMERCE_TASKS.clear()

    def test_generation_history_exposes_stable_work_ids_and_favorites(self):
        with tempfile.TemporaryDirectory() as root:
            database = CanvasDatabase(Path(root) / "canvas.db")
            database.initialize()
            database.prepend_history({
                "type": "ecommerce",
                "timestamp": 123.5,
                "images": ["/assets/output/one.png", "/assets/output/two.png"],
                "inputs": [{"role": "source", "url": "/assets/input/source.png"}],
                "image_items": [{"width": 1024, "height": 1280}, {"width": 1024, "height": 1280}],
            })
            records = database.list_history()
            self.assertTrue(records[0]["_history_id"])
            first = self.main.generated_work_items(records, {})
            second = self.main.generated_work_items(records, {first[1]["id"]: {"favorite": True, "updated_at": 456}})
            self.assertEqual([item["id"] for item in first], [item["id"] for item in second])
            self.assertEqual(first[0]["source_url"], "/assets/input/source.png")
            self.assertEqual((first[0]["width"], first[0]["height"]), (1024, 1280))
            self.assertTrue(second[1]["favorite"])


class EcommerceFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parent.parent
        cls.html = (root / "static" / "ecommerce.html").read_text(encoding="utf-8")
        cls.javascript = (root / "static" / "js" / "ecommerce.js").read_text(encoding="utf-8")
        cls.css = (root / "static" / "css" / "ecommerce.css").read_text(encoding="utf-8")
        cls.api_javascript = (root / "static" / "js" / "api-settings.js").read_text(encoding="utf-8")
        cls.api_html = (root / "static" / "api-settings.html").read_text(encoding="utf-8")

    def test_model_panel_contains_generation_parameter_dropdowns(self):
        panel = re.search(r'<section id="advancedSettings".*?</section>', self.html, re.S)
        self.assertIsNotNone(panel)
        panel_html = panel.group(0)
        for control_id in ("ratioSelect", "resolutionSelect", "qualitySelect", "countSelect"):
            self.assertIn(f'id="{control_id}"', panel_html)
        ratio = re.search(r'<select id="ratioSelect">(.*?)</select>', panel_html, re.S)
        self.assertIsNotNone(ratio)
        self.assertIn('<option value="4:5">4:5</option>', ratio.group(1))

    def test_generation_parameters_are_persisted_and_submitted(self):
        for field in ("aspect_ratio:state.aspectRatio", "resolution:state.resolution", "quality:state.quality", "count:state.count"):
            self.assertGreaterEqual(self.javascript.count(field), 2)
        for control_id in ("ratioSelect", "resolutionSelect", "qualitySelect", "countSelect"):
            self.assertRegex(self.javascript, rf"el\.{control_id}\.addEventListener\('change'")

    def test_each_operation_has_an_independent_persistent_workspace(self):
        self.assertIn("workspaces:Object.fromEntries", self.javascript)
        self.assertIn("workspaces:serializableWorkspaces()", self.javascript)
        switch_body = re.search(r"function switchOperation\(operation\)\{(.*?)\n    \}", self.javascript, re.S)
        self.assertIsNotNone(switch_body)
        self.assertIn("captureWorkspace()", switch_body.group(1))
        self.assertIn("restoreWorkspace(operation)", switch_body.group(1))
        self.assertNotIn("state.inputs = {}", switch_body.group(1))

    def test_universal_tab_is_first_and_default_entry(self):
        first_tab = re.search(r'<nav id="operationTabs".*?<button[^>]+data-operation="([^"]+)"[^>]*>\s*<span>01</span>', self.html, re.S)
        self.assertIsNotNone(first_tab)
        self.assertEqual(first_tab.group(1), "universal")
        self.assertIn('const DEFAULT_OPERATION = \'universal\'', self.javascript)
        self.assertIn("operation:DEFAULT_OPERATION", self.javascript)
        self.assertIn("schema_version:SETTINGS_SCHEMA_VERSION", self.javascript)
        self.assertIn("else state.operation = DEFAULT_OPERATION", self.javascript)
        self.assertIn("isTextEditingElement()", self.javascript)
        self.assertIn("shouldIgnoreIncomingSettings()", self.javascript)
        self.assertIn("restoreEditingFocus(control)", self.javascript)
        self.assertIn("applyIncomingSettings(String(incomingSettings))", self.javascript)

    def test_universal_tab_supports_ordered_role_aware_references(self):
        self.assertIn('data-operation="universal"', self.html)
        self.assertIn("universal_reference_limit", self.javascript)
        self.assertIn("data-reference-type", self.javascript)
        self.assertIn("dragstart", self.javascript)
        self.assertIn("reference_type:item.reference_type", self.javascript)
        self.assertNotIn("universalInstructionRequired", self.javascript)

    def test_universal_tab_uses_six_presets_and_a_bottom_action_dock(self):
        self.assertIn("const UNIVERSAL_PRESET_ROLES = ['subject','full_garment','shoes','accessory','pose','scene']", self.javascript)
        self.assertIn('id="universalDock"', self.html)
        self.assertIn('id="universalDockInputs"', self.html)
        self.assertIn('id="universalDockActions"', self.html)
        self.assertIn('id="addUniversalReference"', self.html)
        self.assertIn("syncUniversalLayout()", self.javascript)
        self.assertIn("inputTarget.appendChild(el.inputModule)", self.javascript)
        self.assertIn("actionTarget.appendChild(el.generateActions)", self.javascript)
        self.assertIn(".ec-universal-dock { position:fixed", self.css)
        self.assertIn("grid-template-columns:repeat(6,minmax(0,1fr))", self.css)
        self.assertIn(".ec-universal-dock.has-many-references", self.css)
        self.assertIn("ec-add-reference-action", self.css)
        self.assertIn("transform:translateX(-50%)", self.css)
        self.assertIn("nextOrder", self.javascript)
        self.assertIn("bindComposingInput(input", self.javascript)
        self.assertIn("data-reference-drag-handle", self.javascript)
        self.assertNotIn('[data-reference-key][draggable="true"]', self.javascript)
        for marker in ("ecommerce.presetModel", "ecommerce.presetGarment", "ecommerce.presetShoes", "ecommerce.presetAccessory", "ecommerce.presetPose", "ecommerce.presetScene"):
            self.assertIn(marker, self.javascript)

    def test_universal_result_uses_fixed_square_frame_and_reserved_bands(self):
        self.assertIn('class="ec-result-frame"', self.html)
        self.assertLess(self.html.index('id="resultMeta"'), self.html.index('id="compareStage"'))
        self.assertLess(self.html.index('id="compareStage"'), self.html.index('id="candidateList"'))
        self.assertIn(".ec-page.is-universal .ec-result-frame", self.css)
        self.assertIn("aspect-ratio:1", self.css)
        self.assertIn("grid-template-rows:52px minmax(0,1fr) 96px", self.css)

    def test_frontend_tracks_multiple_tasks_without_disabling_generation(self):
        self.assertIn("tasksById:new Map()", self.javascript)
        self.assertIn("activeTaskIds:new Set()", self.javascript)
        self.assertIn("/api/ecommerce/tasks/status", self.javascript)
        self.assertIn("scheduleTaskPolling(100)", self.javascript)
        create_body = re.search(r"async function createTask\(parentTaskId=''\)\{(.*?)\n    \}", self.javascript, re.S)
        self.assertIsNotNone(create_body)
        self.assertNotIn("generateButton.disabled", create_body.group(1))

    def test_api_settings_exposes_builtin_visual_model_and_url_completion(self):
        self.assertIn("LOCAL_VISION_DEFAULT_MODEL", self.api_javascript)
        self.assertIn("normalizeOpenAiCompatibleBaseUrl", self.api_javascript)
        self.assertIn("show-local-vision", self.api_javascript)
        self.assertIn('id="chatModelsTitle"', self.api_html)


if __name__ == "__main__":
    unittest.main()
