import importlib.util
import sys
import types
from pathlib import Path


def load_entrypoint_module():
    sys.modules.setdefault("pwd", types.SimpleNamespace(getpwnam=lambda _: None))
    path = Path("docker-entrypoint.py").resolve()
    spec = importlib.util.spec_from_file_location("docker_entrypoint", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_ensure_dreamina_cli_state_populates_empty_mount(tmp_path):
    entrypoint = load_entrypoint_module()
    template = tmp_path / "template"
    state = tmp_path / "state"
    (template / "dreamina").mkdir(parents=True)
    (template / "version.json").write_text('{"version":"1.4.3"}\n', encoding="utf-8")
    (template / "dreamina" / "SKILL.md").write_text("skill\n", encoding="utf-8")

    entrypoint.DREAMINA_CLI_TEMPLATE_DIR = str(template)
    entrypoint.DREAMINA_CLI_DIR = str(state)

    entrypoint.ensure_dreamina_cli_state()

    assert (state / "version.json").read_text(encoding="utf-8") == '{"version":"1.4.3"}\n'
    assert (state / "dreamina" / "SKILL.md").read_text(encoding="utf-8") == "skill\n"


def test_ensure_dreamina_cli_state_updates_managed_files_without_removing_auth(tmp_path):
    entrypoint = load_entrypoint_module()
    template = tmp_path / "template"
    state = tmp_path / "state"
    (template / "dreamina").mkdir(parents=True)
    (state / "dreamina").mkdir(parents=True)
    (template / "version.json").write_text('{"version":"1.4.3"}\n', encoding="utf-8")
    (template / "dreamina" / "SKILL.md").write_text("new skill\n", encoding="utf-8")
    (state / "version.json").write_text('{"version":"old"}\n', encoding="utf-8")
    (state / "dreamina" / "SKILL.md").write_text("old skill\n", encoding="utf-8")
    (state / "auth.json").write_text('{"token":"keep"}\n', encoding="utf-8")

    entrypoint.DREAMINA_CLI_TEMPLATE_DIR = str(template)
    entrypoint.DREAMINA_CLI_DIR = str(state)

    entrypoint.ensure_dreamina_cli_state()

    assert (state / "version.json").read_text(encoding="utf-8") == '{"version":"1.4.3"}\n'
    assert (state / "dreamina" / "SKILL.md").read_text(encoding="utf-8") == "new skill\n"
    assert (state / "auth.json").read_text(encoding="utf-8") == '{"token":"keep"}\n'
