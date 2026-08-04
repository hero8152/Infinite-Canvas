import unittest
from pathlib import Path


class RunBatTests(unittest.TestCase):
    def test_project_root_is_added_to_sys_path_for_embedded_python(self):
        launcher = Path("run.bat").read_text(encoding="utf-8")

        self.assertIn("sys.path.insert(0, os.getcwd())", launcher)
        self.assertIn("runpy.run_path('main.py', run_name='__main__')", launcher)


class MacLauncherScriptTests(unittest.TestCase):
    def test_mac_shell_launcher_uses_runpy_with_project_root_on_sys_path(self):
        launcher = Path("mac-启动服务.sh").read_text(encoding="utf-8")

        self.assertIn("sys.path.insert(0, os.getcwd())", launcher)
        self.assertIn("runpy.run_path('main.py', run_name='__main__')", launcher)
        self.assertNotIn("python3 main.py", launcher)

    def test_mac_command_launcher_targets_existing_shell_script(self):
        launcher = Path("mac-启动服务.command").read_text(encoding="utf-8")

        self.assertIn("./mac-启动服务.sh", launcher)
        self.assertNotIn("启动服务.py", launcher)


if __name__ == "__main__":
    unittest.main()
