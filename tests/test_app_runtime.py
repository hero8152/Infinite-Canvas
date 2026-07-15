import ast
import os
import unittest

from app_runtime import app_base_url, resolve_app_port, resolve_runtime_paths


class ResolveRuntimePathsTests(unittest.TestCase):
    def test_defaults_to_base_dir_when_data_root_missing(self):
        paths = resolve_runtime_paths("/tmp/app")
        expected_app_dir = os.path.abspath("/tmp/app")

        self.assertEqual(paths["APP_DIR"], expected_app_dir)
        self.assertEqual(paths["APP_DATA_ROOT"], expected_app_dir)
        self.assertEqual(paths["STATIC_DIR"], os.path.join(expected_app_dir, "static"))
        self.assertEqual(paths["STATIC_RUNNINGHUB_DIR"], os.path.join(expected_app_dir, "static", "runninghub"))
        self.assertEqual(
            paths["STATIC_RUNNINGHUB_THUMBNAIL_DIR"],
            os.path.join(expected_app_dir, "static", "runninghub", "thumbnails"),
        )
        self.assertEqual(
            paths["STATIC_RUNNINGHUB_API_PROVIDERS_FILE"],
            os.path.join(expected_app_dir, "static", "runninghub", "api_providers.json"),
        )
        self.assertEqual(paths["API_ENV_FILE"], os.path.join(expected_app_dir, "API", ".env"))

    def test_separates_resource_and_data_roots(self):
        paths = resolve_runtime_paths("/opt/infinite-canvas", "/data/infinite-canvas")
        expected_app_dir = os.path.abspath("/opt/infinite-canvas")
        expected_data_root = os.path.abspath("/data/infinite-canvas")

        self.assertEqual(paths["WORKFLOW_DIR"], os.path.join(expected_app_dir, "workflows"))
        self.assertEqual(paths["STATIC_DIR"], os.path.join(expected_app_dir, "static"))
        self.assertEqual(
            paths["STATIC_RUNNINGHUB_API_PROVIDERS_FILE"],
            os.path.join(expected_app_dir, "static", "runninghub", "api_providers.json"),
        )
        self.assertEqual(
            paths["STATIC_RUNNINGHUB_THUMBNAIL_DIR"],
            os.path.join(expected_app_dir, "static", "runninghub", "thumbnails"),
        )
        self.assertEqual(paths["OUTPUT_DIR"], os.path.join(expected_data_root, "output"))
        self.assertEqual(paths["DATA_DIR"], os.path.join(expected_data_root, "data"))
        self.assertEqual(paths["GLOBAL_CONFIG_FILE"], os.path.join(expected_data_root, "global_config.json"))
        self.assertEqual(
            paths["RUNNINGHUB_WORKFLOW_STORE_FILE"],
            os.path.join(expected_data_root, "data", "runninghub_workflows.json"),
        )

    def test_main_defines_used_runtime_path_globals(self):
        runtime_keys = set(resolve_runtime_paths("/tmp/app"))
        main_path = os.path.join(os.path.dirname(__file__), "..", "main.py")
        with open(main_path, encoding="utf-8") as handle:
            tree = ast.parse(handle.read())

        defined_names = set()
        used_names = set()
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined_names.add(target.id)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                defined_names.add(node.name)
            for child in ast.walk(node):
                if isinstance(child, ast.Name):
                    used_names.add(child.id)

        self.assertFalse((runtime_keys & used_names) - defined_names)

    def test_resolve_app_port_uses_default_for_invalid_values(self):
        self.assertEqual(resolve_app_port(""), 3000)
        self.assertEqual(resolve_app_port("70000"), 3000)
        self.assertEqual(resolve_app_port("3005"), 3005)

    def test_app_base_url_uses_resolved_port(self):
        self.assertEqual(app_base_url(3011), "http://127.0.0.1:3011")
        self.assertEqual(app_base_url("bad"), "http://127.0.0.1:3000")


if __name__ == "__main__":
    unittest.main()
