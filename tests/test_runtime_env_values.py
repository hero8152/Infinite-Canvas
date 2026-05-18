import os
from pathlib import Path
import sys
import tempfile
import unittest
import asyncio
import json

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import main


class RuntimeEnvValuesTest(unittest.TestCase):
    def test_process_env_takes_precedence_over_api_env_file(self):
        original_api_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_RUNTIME_TEST_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                env_file.write_text(f"{key}=fresh-from-file\n", encoding="utf-8")
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {}
                os.environ[key] = "from-process"

                self.assertEqual(main.runtime_env_value(key), "from-process")
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_api_env_file_update_overrides_bootstrap_seeded_process_env(self):
        original_api_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_BOOTSTRAP_TEST_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                env_file.write_text(f"{key}=fresh-from-file\n", encoding="utf-8")
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {key: "old-file-value"}
                os.environ[key] = "old-file-value"

                self.assertEqual(main.runtime_env_value(key), "fresh-from-file")
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_update_env_values_does_not_override_explicit_process_env(self):
        original_api_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_EXPLICIT_PROCESS_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {}
                os.environ[key] = "from-process"

                main.update_env_values({key: "from-ui-save"})

                self.assertEqual(main.runtime_env_value(key), "from-process")
                self.assertIn(f"{key}=from-ui-save", env_file.read_text(encoding="utf-8"))
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_update_env_values_refreshes_bootstrap_seeded_env(self):
        original_api_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_BOOTSTRAP_SAVE_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {key: "old-file-value"}
                os.environ[key] = "old-file-value"

                main.update_env_values({key: "from-ui-save"})

                self.assertEqual(main.runtime_env_value(key), "from-ui-save")
                self.assertEqual(main.API_ENV_BOOTSTRAP_VALUES[key], "from-ui-save")
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_process_env_is_used_when_key_is_absent_from_file(self):
        original_api_env_file = main.API_ENV_FILE
        key = "API_PROVIDER_RUNTIME_ONLY_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                env_file.write_text("OTHER_KEY=value\n", encoding="utf-8")
                main.API_ENV_FILE = str(env_file)
                os.environ[key] = "from-process"

                self.assertEqual(main.runtime_env_value(key), "from-process")
        finally:
            main.API_ENV_FILE = original_api_env_file
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_config_token_endpoint_never_returns_secret(self):
        original_api_env_file = main.API_ENV_FILE
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        original_global_config_file = main.GLOBAL_CONFIG_FILE
        key = "MODELSCOPE_API_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                main.GLOBAL_CONFIG_FILE = str(Path(tmp) / "global_config.json")
                env_file = Path(tmp) / "API" / ".env"
                env_file.parent.mkdir()
                env_file.write_text(f"{key}=modelscope-test-value\n", encoding="utf-8")
                main.API_ENV_FILE = str(env_file)
                main.API_ENV_BOOTSTRAP_VALUES = {}
                os.environ.pop(key, None)

                result = asyncio.run(main.get_global_token())
                self.assertEqual(result, {"token": "", "has_token": True})
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            main.GLOBAL_CONFIG_FILE = original_global_config_file
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_config_token_endpoint_reports_legacy_token_without_returning_it(self):
        original_api_env_file = main.API_ENV_FILE
        original_global_config_file = main.GLOBAL_CONFIG_FILE
        old_value = os.environ.get("MODELSCOPE_API_KEY")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                main.API_ENV_FILE = str(Path(tmp) / "API" / ".env")
                config_file = Path(tmp) / "global_config.json"
                config_file.write_text(json.dumps({"modelscope_token": "legacy-test-value"}), encoding="utf-8")
                main.GLOBAL_CONFIG_FILE = str(config_file)
                os.environ.pop("MODELSCOPE_API_KEY", None)

                result = asyncio.run(main.get_global_token())
                self.assertEqual(result, {"token": "", "has_token": True})
                self.assertEqual(main.modelscope_runtime_key(), "legacy-test-value")
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.GLOBAL_CONFIG_FILE = original_global_config_file
            if old_value is None:
                os.environ.pop("MODELSCOPE_API_KEY", None)
            else:
                os.environ["MODELSCOPE_API_KEY"] = old_value

    def test_provider_url_validation_rejects_remote_http(self):
        with self.assertRaises(main.HTTPException) as ctx:
            main.validate_provider_base_url("http://api.example.com/v1")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("https://", ctx.exception.detail)

    def test_provider_url_validation_rejects_fake_loopback_hosts(self):
        for url in ["http://127.evil.com/v1", "http://127.0.0.1.evil.com/v1"]:
            with self.subTest(url=url):
                with self.assertRaises(main.HTTPException) as ctx:
                    main.validate_provider_base_url(url)
                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("https://", ctx.exception.detail)

    def test_provider_url_validation_allows_loopback_http(self):
        self.assertEqual(
            main.validate_provider_base_url("http://127.0.0.1:8000/v1"),
            "http://127.0.0.1:8000/v1",
        )
        self.assertEqual(
            main.validate_provider_base_url("http://[::1]:8000/v1"),
            "http://[::1]:8000/v1",
        )

    def test_saved_key_cannot_be_rebound_to_new_base_url_without_new_key(self):
        original_api_env_file = main.API_ENV_FILE
        original_api_providers_file = main.API_PROVIDERS_FILE
        original_data_dir = main.DATA_DIR
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_DEMO_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                main.DATA_DIR = str(root / "data")
                main.API_PROVIDERS_FILE = str(root / "data" / "api_providers.json")
                main.API_ENV_FILE = str(root / "API" / ".env")
                main.API_ENV_BOOTSTRAP_VALUES = {}
                os.environ.pop(key, None)

                asyncio.run(main.save_providers([
                    main.ApiProviderPayload(
                        id="demo",
                        name="Demo",
                        base_url="https://old.example/v1",
                        api_key="demo-test-key",
                    )
                ]))

                with self.assertRaises(main.HTTPException) as ctx:
                    asyncio.run(main.save_providers([
                        main.ApiProviderPayload(
                            id="demo",
                            name="Demo",
                            base_url="https://attacker.example/v1",
                        )
                    ]))
                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("重新输入 API Key", ctx.exception.detail)
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_PROVIDERS_FILE = original_api_providers_file
            main.DATA_DIR = original_data_dir
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value

    def test_saved_key_base_url_change_with_new_key_is_allowed(self):
        original_api_env_file = main.API_ENV_FILE
        original_api_providers_file = main.API_PROVIDERS_FILE
        original_data_dir = main.DATA_DIR
        original_bootstrap = dict(main.API_ENV_BOOTSTRAP_VALUES)
        key = "API_PROVIDER_DEMO_KEY"
        old_value = os.environ.get(key)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                main.DATA_DIR = str(root / "data")
                main.API_PROVIDERS_FILE = str(root / "data" / "api_providers.json")
                main.API_ENV_FILE = str(root / "API" / ".env")
                main.API_ENV_BOOTSTRAP_VALUES = {}
                os.environ.pop(key, None)

                asyncio.run(main.save_providers([
                    main.ApiProviderPayload(
                        id="demo",
                        name="Demo",
                        base_url="https://old.example/v1",
                        api_key="old-demo-key",
                    )
                ]))
                result = asyncio.run(main.save_providers([
                    main.ApiProviderPayload(
                        id="demo",
                        name="Demo",
                        base_url="https://new.example/v1",
                        api_key="new-demo-key",
                    )
                ]))

                self.assertEqual(result["providers"][0]["base_url"], "https://new.example/v1")
                self.assertEqual(main.runtime_env_value(key), "new-demo-key")
        finally:
            main.API_ENV_FILE = original_api_env_file
            main.API_PROVIDERS_FILE = original_api_providers_file
            main.DATA_DIR = original_data_dir
            main.API_ENV_BOOTSTRAP_VALUES = original_bootstrap
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value


if __name__ == "__main__":
    unittest.main()
