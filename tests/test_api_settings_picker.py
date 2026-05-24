from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "static" / "api-settings.html").read_text(encoding="utf-8")


def between(text, start, end):
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    return text[start_index:end_index]


class ApiSettingsPickerTests(unittest.TestCase):
    def test_picker_has_type_controls_mode_toggle_and_guidance(self):
        self.assertIn("picker-type-btn", HTML)
        self.assertIn("picker-type-menu", HTML)
        self.assertIn("pickerManageModeBtn", HTML)
        self.assertIn("确定更改模型类型", HTML)
        self.assertIn("手动切换仅用于修正自动识别", HTML)
        self.assertIn("Ctrl/Cmd", HTML)
        self.assertIn('aria-label="关闭"', HTML)
        self.assertNotIn(">取消</button>", HTML)

    def test_saved_lists_win_over_local_type_overrides(self):
        snippet = between(HTML, "const overrideCat", "else cat = 'chat';")
        override_branch = "else if(overrideCat && pickerTypeMeta[overrideCat])"
        self.assertLess(snippet.index("if(existing.image.has(id))"), snippet.index(override_branch))
        self.assertLess(snippet.index("else if(existing.video.has(id))"), snippet.index(override_branch))
        self.assertLess(snippet.index("else if(existing.chat.has(id))"), snippet.index(override_branch))
        self.assertLess(snippet.index(override_branch), snippet.index("else if(lastFetchedSuggestion?.image"))

    def test_ctrl_cmd_and_shift_selection_are_supported(self):
        snippet = between(HTML, "function togglePickerRowByIndex", "function selectPickerCat")
        self.assertIn("event?.ctrlKey || event?.metaKey", snippet)
        self.assertIn("event?.shiftKey", snippet)
        self.assertIn("pickerAnchorIndex", snippet)
        self.assertIn("let selection = pickerManageMode ? pickerManageSelected : pickerState.selected", snippet)
        self.assertRegex(snippet, re.compile(r"pickerManageMode && !additive.*?pickerManageSelected = \{ \[id\]: true \}", re.S))

    def test_management_mode_uses_separate_temporary_selection(self):
        self.assertIn("let pickerManageSelected = {}", HTML)
        render_snippet = between(HTML, "function renderModelPicker", "function togglePickerRow")
        self.assertIn("pickerManageMode ? pickerManageSelected[id] === true : pickerState.selected[id] === true", render_snippet)
        mode_snippet = between(HTML, "function togglePickerManageMode", "function pickerTypeButtonHtml")
        self.assertIn("pickerManageSelected = {}", mode_snippet)

    def test_unselected_type_change_does_not_save_model_list(self):
        snippet = between(HTML, "async function setPickerTypeByIndex", "function collectPickerModels")
        self.assertIn("const shouldPersistMove = pickerState.selected[id] === true", snippet)
        self.assertIn("const listedBeforeMove = shouldPersistMove && isProviderModelListed(id)", snippet)
        self.assertRegex(snippet, r"const moved = listedBeforeMove \? moveProviderModelToPickerCategory\(id, cat\) : false;")
        self.assertIn("if(moved){", snippet)

    def test_picker_model_operations_use_model_only_save(self):
        apply_snippet = between(HTML, "async function applyModelPicker", "async function saveProviderModelLists")
        save_snippet = between(HTML, "async function saveProviderModelLists", "async function saveKeyOnly")
        self.assertIn("await saveProviderModelLists(image, chat, video)", apply_snippet)
        self.assertIn("/api/providers/${encodeURIComponent(item.id)}/models", save_snippet)
        self.assertNotIn("saveProviders(", apply_snippet)
        self.assertNotIn("saveProviders(", save_snippet)

    def test_management_mode_saves_then_exits(self):
        snippet = between(HTML, "async function applyModelPicker", "async function saveProviderModelLists")
        self.assertIn("if(pickerManageMode){", snippet)
        self.assertIn("moveProviderModelToPickerCategory(id, pickerState.category[id])", snippet)
        self.assertIn("pickerManageMode = false", snippet)


if __name__ == "__main__":
    unittest.main()
