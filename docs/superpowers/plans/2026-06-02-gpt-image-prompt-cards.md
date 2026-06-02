# GPT Image 2 Prompt Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual GPT Image 2 prompt-case library with GitHub sync, preview cards, copy, and use actions inside the existing prompt-template panels.

**Architecture:** The backend parses the EvoLinkAI Markdown case files into the existing prompt-library item shape plus visual metadata, caches the result in `data/gpt_image_prompts.json`, and exposes sync/read endpoints. The frontend keeps the current prompt-template panel contract, but renders prompt items with `image_url` as a wide card grid and adds a sync button for the read-only GPT Image 2 library.

**Tech Stack:** FastAPI, stdlib urllib/json/re parsing, current vanilla JavaScript panels in `static/js/canvas.js` and `static/js/smart-canvas.js`, existing CSS variables in `static/css/canvas.css` and `static/css/smart-canvas.css`, unittest/FastAPI TestClient.

---

### Task 1: Backend Parser And Cache

**Files:**
- Modify: `main.py`
- Create: `tests/test_gpt_image_prompts.py`

- [ ] **Step 1: Write failing parser/cache tests**

Create tests that call `parse_gpt_image_prompt_cases`, `sync_gpt_image_prompts`, and `/api/prompt-libraries` with mocked remote Markdown.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `python3 -m pytest tests/test_gpt_image_prompts.py -q`

Expected: FAIL because parser and cache functions do not exist yet.

- [ ] **Step 3: Implement parser/cache**

Add constants, category metadata, Markdown parser, cache read/write helpers, sync helper, and read/sync API endpoints.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `python3 -m pytest tests/test_gpt_image_prompts.py -q`

Expected: PASS.

### Task 2: Prompt Library Integration

**Files:**
- Modify: `main.py`
- Test: `tests/test_gpt_image_prompts.py`

- [ ] **Step 1: Write failing public-library test**

Assert `/api/prompt-libraries` includes a read-only `gpt-image-2` library with categories and visual prompt metadata.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `python3 -m pytest tests/test_gpt_image_prompts.py -q`

Expected: FAIL until public library augmentation is implemented.

- [ ] **Step 3: Implement public-library augmentation**

Append the read-only GPT Image 2 library to `public_prompt_libraries` without changing saved user prompt libraries.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `python3 -m pytest tests/test_gpt_image_prompts.py -q`

Expected: PASS.

### Task 3: Visual Card Frontend

**Files:**
- Modify: `static/js/canvas.js`
- Modify: `static/js/smart-canvas.js`
- Modify: `static/css/canvas.css`
- Modify: `static/css/smart-canvas.css`

- [ ] **Step 1: Add card rendering paths**

Detect items with `image_url`, render a wide visual grid, include preview image, source badge, difficulty badge, category tag, prompt summary, details expander, copy, and use buttons.

- [ ] **Step 2: Add sync actions**

When the active library is `gpt-image-2`, show a GitHub sync button. On click, POST `/api/gpt-image-prompts/sync`, refresh libraries, keep the GPT Image 2 library selected, and display status text.

- [ ] **Step 3: Add CSS**

Widen visual-library panels, define responsive grid tracks, stable preview aspect ratios, small tags, and compact action buttons for desktop and mobile.

### Task 4: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend tests**

Run: `python3 -m pytest tests/test_gpt_image_prompts.py -q`

Expected: PASS.

- [ ] **Step 2: Start or reuse local server**

Use the existing `http://localhost:3000/` app if running, otherwise start `python3 main.py`.

- [ ] **Step 3: Verify in Browser**

Open the in-app browser at `http://localhost:3000/`, open a prompt template panel, select `GPT Image 2 案例库`, click sync, confirm image cards render and use/copy buttons work.
