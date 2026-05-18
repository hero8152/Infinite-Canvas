from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "configure_provider.py"
API_SETTINGS = (ROOT / "static" / "api-settings.html").read_text(encoding="utf-8")
I18N = (ROOT / "static" / "i18n.js").read_text(encoding="utf-8")
ZIMAGE = (ROOT / "static" / "zimage.html").read_text(encoding="utf-8")
GITIGNORE = ROOT / ".gitignore"
MS_STATIC_PAGES = [
    (ROOT / "static" / "zimage.html").read_text(encoding="utf-8"),
    (ROOT / "static" / "angle.html").read_text(encoding="utf-8"),
    (ROOT / "static" / "enhance.html").read_text(encoding="utf-8"),
]


def run_configure_provider(project_root, *args, env=None, input_text=None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--project-root", str(project_root), *args],
        input=input_text,
        text=True,
        capture_output=True,
        env=merged_env,
        check=False,
    )


class AgentProviderConfigTest(unittest.TestCase):
    def test_upserts_provider_writes_env_and_masks_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            secret = "test-secret-value-1234567890"

            result = run_configure_provider(
                root,
                "--id",
                "nano-banana",
                "--name",
                "Nano Banana",
                "--base-url",
                "https://api.example.com/v1",
                "--protocol",
                "openai",
                "--api-key-env",
                "NANO_BANANA_TEST_KEY",
                "--image-model",
                "gpt-image-2",
                "--chat-model",
                "gpt-5.5",
                "--set-primary",
                "--print-json",
                env={"NANO_BANANA_TEST_KEY": secret},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("API_PROVIDER_NANO_BANANA_KEY", result.stdout)
            self.assertIn("********7890", result.stdout)
            self.assertNotIn(secret, result.stdout)
            self.assertNotIn(secret, result.stderr)

            providers = json.loads((root / "data" / "api_providers.json").read_text(encoding="utf-8"))
            self.assertEqual(len(providers), 1)
            self.assertEqual(providers[0]["id"], "nano-banana")
            self.assertEqual(providers[0]["name"], "Nano Banana")
            self.assertEqual(providers[0]["base_url"], "https://api.example.com/v1")
            self.assertEqual(providers[0]["protocol"], "openai")
            self.assertTrue(providers[0]["primary"])
            self.assertEqual(providers[0]["image_models"], ["gpt-image-2"])
            self.assertEqual(providers[0]["chat_models"], ["gpt-5.5"])

            env_text = (root / "API" / ".env").read_text(encoding="utf-8")
            self.assertIn("API_PROVIDER_NANO_BANANA_KEY", env_text)
            self.assertIn(secret, env_text)

    def test_idempotent_update_dedupes_models_and_preserves_other_providers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "data"
            data_dir.mkdir()
            (data_dir / "api_providers.json").write_text(
                json.dumps(
                    [
                        {
                            "id": "modelscope",
                            "name": "ModelScope",
                            "base_url": "https://api-inference.modelscope.cn/v1",
                            "protocol": "openai",
                            "enabled": True,
                            "primary": False,
                            "image_models": ["Tongyi-MAI/Z-Image-Turbo"],
                            "chat_models": ["Qwen/Qwen3-235B-A22B"],
                            "video_models": [],
                            "ms_loras": [],
                            "ms_defaults_version": 3,
                        }
                    ]
                ),
                encoding="utf-8",
            )

            first = run_configure_provider(
                root,
                "--id",
                "custom-api",
                "--name",
                "Custom API",
                "--base-url",
                "https://api.custom.test",
                "--image-model",
                "gpt-image-2",
                "--image-model",
                "gpt-image-2",
            )
            second = run_configure_provider(
                root,
                "--id",
                "custom-api",
                "--name",
                "Custom API",
                "--base-url",
                "https://api.custom.test/v1",
                "--chat-model",
                "gpt-5.5",
            )

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            providers = json.loads((data_dir / "api_providers.json").read_text(encoding="utf-8"))
            self.assertEqual([p["id"] for p in providers], ["modelscope", "custom-api"])
            custom = providers[1]
            self.assertEqual(custom["base_url"], "https://api.custom.test/v1")
            self.assertEqual(custom["image_models"], ["gpt-image-2"])
            self.assertEqual(custom["chat_models"], ["gpt-5.5"])

    def test_dry_run_does_not_write_runtime_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = run_configure_provider(
                root,
                "--id",
                "dry-api",
                "--name",
                "Dry API",
                "--base-url",
                "https://api.dry.test",
                "--api-key-stdin",
                "--dry-run",
                input_text="dry-secret-value",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("dry_run", result.stdout)
            self.assertFalse((root / "data" / "api_providers.json").exists())
            self.assertFalse((root / "API" / ".env").exists())
            self.assertNotIn("dry-secret-value", result.stdout)

    def test_remote_plain_http_provider_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = run_configure_provider(
                root,
                "--id",
                "remote-http",
                "--name",
                "Remote HTTP",
                "--base-url",
                "http://api.example.com/v1",
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("Use HTTPS for remote API providers", result.stderr)
            self.assertFalse((root / "data" / "api_providers.json").exists())

    def test_fake_loopback_plain_http_hosts_are_rejected(self):
        for url in ["http://127.evil.com/v1", "http://127.0.0.1.evil.com/v1"]:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                result = run_configure_provider(
                    root,
                    "--id",
                    "fake-loopback",
                    "--name",
                    "Fake Loopback",
                    "--base-url",
                    url,
                )

                self.assertEqual(result.returncode, 2)
                self.assertIn("Use HTTPS for remote API providers", result.stderr)
                self.assertFalse((root / "data" / "api_providers.json").exists())

    def test_local_plain_http_provider_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = run_configure_provider(
                root,
                "--id",
                "local-api",
                "--name",
                "Local API",
                "--base-url",
                "http://127.0.0.1:8000/v1",
                "--image-model",
                "local-image",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            providers = json.loads((root / "data" / "api_providers.json").read_text(encoding="utf-8"))
            self.assertEqual(providers[0]["base_url"], "http://127.0.0.1:8000/v1")

    def test_frontend_exposes_agent_setup_contract(self):
        self.assertIn("agentSetupBlock", API_SETTINGS)
        self.assertIn("agentSetupCommand", API_SETTINGS)
        self.assertIn("scripts/configure_provider.py", API_SETTINGS)
        self.assertIn("copyAgentSetupCommand()", API_SETTINGS)
        self.assertIn("item.key_env", API_SETTINGS)
        self.assertIn("api.agentSetupTitle", API_SETTINGS)
        self.assertIn("'api.agentSetupTitle': 'Agent 配置'", I18N)
        self.assertIn("'api.agentSetupTitle': 'Agent setup'", I18N)
        self.assertIn("function setupModelFlags", API_SETTINGS)
        self.assertIn("...setupModelFlags('--image-model', item.image_models)", API_SETTINGS)
        self.assertIn("...setupModelFlags('--chat-model', item.chat_models)", API_SETTINGS)
        self.assertIn("...setupModelFlags('--video-model', item.video_models)", API_SETTINGS)
        self.assertNotIn("firstNonEmpty", API_SETTINGS)

    def test_frontend_save_preserves_primary_flag(self):
        payload_start = API_SETTINGS.index("body:JSON.stringify(providers.map(item => ({")
        payload_end = API_SETTINGS.index("api_key:item._clearKey", payload_start)
        save_payload = API_SETTINGS[payload_start:payload_end]
        self.assertIn("primary:!!item.primary", save_payload)
        self.assertNotIn("primary:false", save_payload)

    def test_text_to_image_console_exposes_api_generation_mode(self):
        self.assertIn("id=\"modeApi\"", ZIMAGE)
        self.assertIn("switchEngine('api')", ZIMAGE)
        self.assertIn("runApiTask(prompt)", ZIMAGE)
        self.assertIn("fetch('/api/config')", ZIMAGE)
        self.assertIn("fetch('/api/canvas-image-tasks'", ZIMAGE)
        self.assertIn("const HISTORY_TYPES = ['zimage', 'online', 'cloud'];", ZIMAGE)
        self.assertIn("LIVE_HISTORY_TYPES.includes(msg.data?.type)", ZIMAGE)
        self.assertIn("function preferredApiImageModel", ZIMAGE)
        self.assertIn("preferredApiImageModel(models)", ZIMAGE)
        self.assertIn("provider_id:apiProvider", ZIMAGE)
        self.assertIn("model:apiModel", ZIMAGE)
        self.assertIn("'studio.renderApi': 'API 生成'", I18N)
        self.assertIn("'studio.renderApi': 'API Generate'", I18N)

    def test_text_to_image_console_uses_async_api_tasks_and_ratio_size_controls(self):
        self.assertIn("id=\"ratioSelect\"", ZIMAGE)
        self.assertIn("id=\"resolutionSelect\"", ZIMAGE)
        self.assertIn("function apiImageSize", ZIMAGE)
        self.assertIn("const SIZE_MAP", ZIMAGE)
        self.assertIn("'1k':'1024x1024'", ZIMAGE)
        self.assertIn("'2k':'2048x2048'", ZIMAGE)
        self.assertIn("'4k':'2880x2880'", ZIMAGE)
        self.assertIn("fetch('/api/canvas-image-tasks'", ZIMAGE)
        self.assertIn("pollApiTask", ZIMAGE)
        self.assertIn("size:apiImageSize()", ZIMAGE)
        self.assertIn("activeApiTasks", ZIMAGE)
        self.assertNotIn("mainGenBtn.disabled = isLoading", ZIMAGE)
        self.assertNotIn("size: `${document.getElementById('width').value}x${document.getElementById('height').value}`", ZIMAGE)

    def test_modelscope_static_pages_do_not_read_raw_saved_token(self):
        for page in MS_STATIC_PAGES:
            self.assertIn("has_token", page)
            self.assertNotIn("data.token", page)
            self.assertNotIn("tokenData.token", page)

    def test_private_runtime_files_are_ignored_for_public_contribution(self):
        text = GITIGNORE.read_text(encoding="utf-8")
        for pattern in [
            "API/.env",
            "data/",
            "output/",
            "assets/input/",
            "assets/output/",
            ".venv/",
            ".gitnexus/",
            ".claude/skills/generated/",
            ".claude/skills/gitnexus/",
            "__pycache__/",
        ]:
            self.assertIn(pattern, text)


if __name__ == "__main__":
    unittest.main()
