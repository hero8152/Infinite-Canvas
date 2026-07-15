import unittest
from pathlib import Path


class DockerfileTests(unittest.TestCase):
    def test_runtime_import_dependencies_are_copied(self):
        dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

        self.assertIn("main.py", dockerfile)
        self.assertIn("app_runtime.py", dockerfile)

    def test_entrypoint_line_endings_are_normalized(self):
        dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

        self.assertIn("sed -i 's/\\r$//' /usr/local/bin/docker-entrypoint.py", dockerfile)


if __name__ == "__main__":
    unittest.main()
