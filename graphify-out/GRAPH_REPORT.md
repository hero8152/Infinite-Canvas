# Graph Report - d:/ziyong/Infinite-Canvas  (2026-06-07)

## Corpus Check
- 56 files · ~953,777 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5379 nodes · 14474 edges · 25 communities detected
- Extraction: 37% EXTRACTED · 63% INFERRED · 0% AMBIGUOUS · INFERRED: 9060 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `tr()` - 106 edges
2. `tr()` - 92 edges
3. `Vector3` - 76 edges
4. `push()` - 62 edges
5. `render()` - 59 edges
6. `map()` - 59 edges
7. `render()` - 56 edges
8. `handleClick()` - 56 edges
9. `scheduleSave()` - 55 edges
10. `Vector2` - 55 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Three.js Object Helpers"
Cohesion: 0.0
Nodes (92): ArrowHelper, AxesHelper, BatchedMesh, Box2, Box3, Box3Helper, BoxGeometry, BoxHelper (+84 more)

### Community 1 - "Smart Canvas Composer"
Cohesion: 0.01
Nodes (734): activeAssetCategory(), activeAssetLibrary(), activeComposerNode(), activeInputImagesFor(), activePromptLibrary(), activePromptTemplateGroups(), activePromptTemplateNodeId(), activeSettingsSubject() (+726 more)

### Community 2 - "Three.js Core Primitives"
Cohesion: 0.0
Nodes (267): addContour(), addUniform(), allocTexUnits(), AmbientLight, AnimationClip, AnimationLoader, AnimationObjectGroup, ArcCurve (+259 more)

### Community 3 - "Canvas Workflow Graph"
Cohesion: 0.01
Nodes (698): actionFailed(), activeCanvasAssetCategory(), activeCanvasAssetLibrary(), activeCanvasMediaCategory(), activeCanvasPromptLibrary(), activeCanvasPromptLibraryItems(), activeCanvasPromptTemplateGroups(), activeCanvasWorkflowCategory() (+690 more)

### Community 4 - "FastAPI Backend Core"
Cohesion: 0.01
Nodes (689): BaseModel, Exception, add_asset_library_item(), add_prompt_library_category(), add_prompt_library_item(), ai_config(), AIReference, api_headers() (+681 more)

### Community 5 - "Tailwind CSS Library"
Cohesion: 0.01
Nodes (510): _a(), aa(), ac(), add(), addToError(), Ae(), after(), Ah() (+502 more)

### Community 6 - "API Provider Settings"
Cohesion: 0.03
Nodes (170): addModel(), addMsLora(), addProvider(), applyDetectedProtocol(), applyModelPicker(), applyProviderOnboardingDefaults(), applyRhEditorGraphTransform(), applyRhImageSlotDefaults() (+162 more)

### Community 7 - "Asset Manager UI"
Cohesion: 0.04
Nodes (167): activeAssetCategory(), activeAssetLibrary(), activeAvatarProvider(), activeLocalFolder(), activePromptCategories(), activePromptLibrary(), activeWorkflowCategory(), activeWorkflowLibrary() (+159 more)

### Community 8 - "Three.js Animation"
Cohesion: 0.02
Nodes (11): AnimationAction, AnimationMixer, Audio, AudioAnalyser, AudioListener, CubicInterpolant, DiscreteInterpolant, Interpolant (+3 more)

### Community 9 - "ComfyUI Instance Settings"
Cohesion: 0.06
Nodes (78): addComfyInstance(), addDropdownOption(), addMiniNode(), applyActiveRandomValues(), applyGraphTransform(), applyLanguage(), attachPanZoom(), bindMiniCanvas() (+70 more)

### Community 10 - "LTX Director Timeline"
Cohesion: 0.1
Nodes (6): beforeRegisterNodeDef(), clamp(), hideWidget(), isCanvasLTXNode(), parseInitial(), TimelineEditor

### Community 11 - "Three.js Math Utils"
Cohesion: 0.06
Nodes (3): Euler, makeClipAdditive(), Quaternion

### Community 12 - "Agent HTML Builder"
Cohesion: 0.18
Nodes (18): build(), export_config(), extract_summary(), find_callout(), infer_meta(), _inline_md(), main(), md_to_html() (+10 more)

### Community 13 - "Theme System"
Cohesion: 0.23
Nodes (13): applyScale(), applyTheme(), autoScale(), broadcastScale(), currentScaleMode(), ensureScaleStyle(), isFramed(), normalizeScaleMode() (+5 more)

### Community 14 - "get-pip Bootstrap"
Cohesion: 0.31
Nodes (9): bootstrap(), determine_pip_install_arguments(), include_setuptools(), include_wheel(), main(), monkeypatch_for_cert(), Install setuptools only if absent, not excluded and when using Python <3.12., Install wheel only if absent, not excluded and when using Python <3.12. (+1 more)

### Community 15 - "Lucide Icon Library"
Cohesion: 0.36
Nodes (8): Ba(), cA(), dA(), iA(), ka(), MA(), Pa(), za()

### Community 16 - "i18n Core Engine"
Cohesion: 0.39
Nodes (7): apply(), entries(), lang(), register(), set(), t(), toggle()

### Community 17 - "Jimeng CLI Installer"
Cohesion: 0.48
Nodes (4): Convert-ToWslPath(), Invoke-WslScript(), Invoke-WslScriptCapture(), New-WslScriptFile()

### Community 18 - "History Bulk Manager"
Cohesion: 0.6
Nodes (4): attach(), fmt(), injectStyles(), tr()

### Community 19 - "Jimeng CLI Login"
Cohesion: 0.6
Nodes (3): Convert-ToWslPath(), Invoke-WslScript(), New-WslScriptFile()

### Community 20 - "Image Preview Utility"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "i18n Module Loader"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "i18n Common Strings"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "i18n Studio Strings"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "i18n Validator"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **105 isolated node(s):** `Install setuptools only if absent, not excluded and when using Python <3.12.`, `Install wheel only if absent, not excluded and when using Python <3.12.`, `Patches `pip install` to provide default certificate with the lowest priority.`, `首次运行时提前创建配置目录，避免第一次保存 API Key 时才创建目录/文件。`, `保存 API 设置后，将 os.environ 里最新的值同步回模块级全局变量，     避免保存后需要重启才能生效。` (+100 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `i18n Module Loader`** (1 nodes): `i18n.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `i18n Common Strings`** (1 nodes): `common.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `i18n Studio Strings`** (1 nodes): `studio.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `i18n Validator`** (1 nodes): `validate-i18n.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Vector3` connect `Three.js Object Helpers` to `Three.js Core Primitives`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Vector2` connect `Three.js Object Helpers` to `Three.js Core Primitives`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `Vector4` connect `Three.js Object Helpers` to `Three.js Core Primitives`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 105 inferred relationships involving `tr()` (e.g. with `performUndo()` and `trf()`) actually correct?**
  _`tr()` has 105 INFERRED edges - model-reasoned connections that need verification._
- **Are the 91 inferred relationships involving `tr()` (e.g. with `trf()` and `actionFailed()`) actually correct?**
  _`tr()` has 91 INFERRED edges - model-reasoned connections that need verification._
- **Are the 61 inferred relationships involving `push()` (e.g. with `warn()` and `ve()`) actually correct?**
  _`push()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **Are the 58 inferred relationships involving `render()` (e.g. with `performUndo()` and `renderMinimap()`) actually correct?**
  _`render()` has 58 INFERRED edges - model-reasoned connections that need verification._