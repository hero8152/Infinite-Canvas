import { test, expect } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const SCREENSHOT_DIR = "../docs/quiet-creative-os/screenshots";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

test.setTimeout(60000);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseCanvas() {
  return {
    id: "canvas-qa",
    title: "Native Canvas QA",
    icon: "▦",
    kind: "classic",
    created_at: 1700000000,
    updated_at: 1700000001,
    mystery_canvas_field: "preserve-me",
    viewport: { x: 0, y: 0, scale: 1, unknownViewport: true },
    logs: [{ event: "legacy-log", keep: true }],
    settings: { legacySetting: true },
    nodes: [
      { id: "prompt-1", type: "prompt", name: "Prompt QA", text: "direct prompt", x: 40, y: 40, w: 260, h: 170, unknownNodeField: "keep-node" },
      { id: "llm-1", type: "llm", name: "LLM QA", text: "stale text", prompt: "stale prompt", chatInput: "stale chat", systemPrompt: "sys", model: "gpt-test", llmProvider: "comfly", x: 40, y: 260, w: 340, h: 240 },
      { id: "gen-1", type: "generator", name: "Generator QA", providerId: "comfly", model: "gpt-image-2", size: "1024x1024", count: 1, generatedOutputs: [], x: 430, y: 40, w: 360, h: 230 },
      { id: "right-1", type: "prompt", name: "Right side QA", text: "right node stays clickable", x: 886, y: 40, w: 260, h: 170 },
      { id: "image-1", type: "image", name: "Image QA", url: "/output/ref.png", x: 40, y: 540, w: 280, h: 230 },
      { id: "workflow-1", type: "comfy", name: "Custom Workflow QA", mode: "custom", comfyWorkflow: "custom/test.json", comfyParams: { style: "editorial", steps: 7 }, generatedOutputs: [], x: 430, y: 540, w: 360, h: 230 },
      { id: "video-1", type: "video", name: "Video QA", providerId: "comfly", model: "veo3-fast", duration: 5, aspectRatio: "16:9", resolution: "720p", useFrameRoles: true, videos: [], x: 840, y: 540, w: 340, h: 220 },
      { id: "msgen-1", type: "msgen", name: "ModelScope QA", msgenModel: "zimage", msWidth: 1024, msHeight: 1024, generatedOutputs: [], x: 1240, y: 540, w: 380, h: 230 },
      { id: "loop-1", type: "loop", name: "Loop QA", count: 3, loopStart: 2, mode: "serial", showPrompt: true, imageInput: false, variablePrompt: "Frame 《计数》 of 《总数》", fixedPrompt: "steady style", x: 1240, y: 40, w: 336, h: 240 },
      { id: "pg-1", type: "promptGroup", name: "Prompt Group QA", items: ["prompt-1"], x: 40, y: 820, w: 360, h: 220 },
      { id: "output-1", type: "output", name: "Output QA", images: ["/output/existing.png"], videos: [], x: 430, y: 820, w: 360, h: 240 }
    ],
    connections: [
      { id: "c-prompt-gen", from: "prompt-1", to: "gen-1" },
      { id: "c-llm-gen", from: "llm-1", to: "gen-1" },
      { id: "c-image-workflow", from: "image-1", to: "workflow-1" },
      { id: "c-prompt-workflow", from: "prompt-1", to: "workflow-1" },
      { id: "c-prompt-video", from: "prompt-1", to: "video-1" },
      { id: "c-image-video", from: "image-1", to: "video-1" },
      { id: "c-loop-msgen", from: "loop-1", to: "msgen-1" }
    ]
  };
}

async function setupRoutes(page, state) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/static/canvas.html") {
      state.staticCanvasRequests += 1;
      return route.fulfill({ status: 500, body: "static canvas blocked in QA" });
    }
    if (path.startsWith("/output/") && path.endsWith(".png")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
    }
    if (path.startsWith("/output/") && path.endsWith(".mp4")) {
      return route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([]) });
    }
    if (path === "/api/config") {
      return route.fulfill({ json: {
        base_url: "mock",
        chat_model: "gpt-test",
        image_model: "gpt-image-2",
        chat_models: ["gpt-test"],
        image_models: ["gpt-image-2"],
        video_models: ["veo3-fast"],
        has_api_key: true,
        has_ms_key: true,
        api_providers: [
          { id: "comfly", name: "Comfly", enabled: true, primary: true, has_key: true, image_models: ["gpt-image-2"], chat_models: ["gpt-test"], video_models: ["veo3-fast"] },
          { id: "modelscope", name: "ModelScope", enabled: true, has_key: true, image_models: ["black-forest-labs/FLUX.2-klein-9B"], chat_models: ["qwen"], video_models: [] }
        ]
      } });
    }
    if (path === "/api/queue_status") return route.fulfill({ json: { total: 0, position: 0, status: "idle" } });
    if (path === "/api/gallery/assets") return route.fulfill({ json: { assets: [{ id: "asset-1", url: "/output/gallery.png", title: "Gallery QA", source: "qa" }], page: 1, page_size: 6, total: 1 } });
    if (path === "/api/canvases" && request.method() === "GET") {
      return route.fulfill({ json: { canvases: state.canvases.filter((canvas) => !canvas.deleted_at).map((canvas) => ({ id: canvas.id, title: canvas.title, icon: canvas.icon, updated_at: canvas.updated_at, node_count: canvas.nodes.length })) } });
    }
    if (path === "/api/canvases/trash") {
      return route.fulfill({ json: { retention_days: 30, canvases: state.canvases.filter((canvas) => canvas.deleted_at).map((canvas) => ({ id: canvas.id, title: canvas.title, icon: canvas.icon, deleted_at: canvas.deleted_at })) } });
    }
    if (path === "/api/canvases" && request.method() === "POST") {
      const payload = request.postDataJSON();
      const created = { ...baseCanvas(), id: "canvas-created", title: payload.title, icon: payload.icon, nodes: [], connections: [], updated_at: 1700001000 };
      state.canvases.unshift(created);
      return route.fulfill({ json: { canvas: created } });
    }
    const canvasMatch = path.match(/^\/api\/canvases\/([^/]+)$/);
    if (canvasMatch && request.method() === "GET") {
      const canvas = state.canvases.find((item) => item.id === canvasMatch[1]);
      return route.fulfill({ json: { canvas: clone(canvas || state.canvases[0]) } });
    }
    if (canvasMatch && request.method() === "PUT") {
      const payload = request.postDataJSON();
      state.savePayloads.push(payload);
      const canvas = state.canvases.find((item) => item.id === canvasMatch[1]) || state.canvases[0];
      Object.assign(canvas, payload, { updated_at: Date.now() / 1000 });
      return route.fulfill({ json: { canvas: clone(canvas) } });
    }
    if (canvasMatch && request.method() === "DELETE") {
      const canvas = state.canvases.find((item) => item.id === canvasMatch[1]);
      if (canvas) canvas.deleted_at = Date.now() / 1000;
      return route.fulfill({ json: { ok: true } });
    }
    const restoreMatch = path.match(/^\/api\/canvases\/([^/]+)\/restore$/);
    if (restoreMatch) {
      const canvas = state.canvases.find((item) => item.id === restoreMatch[1]);
      if (canvas) delete canvas.deleted_at;
      return route.fulfill({ json: { canvas: clone(canvas || state.canvases[0]) } });
    }
    const purgeMatch = path.match(/^\/api\/canvases\/([^/]+)\/purge$/);
    if (purgeMatch) {
      state.canvases = state.canvases.filter((item) => item.id !== purgeMatch[1]);
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/workflows") return route.fulfill({ json: { workflows: [{ name: "custom/test.json", title: "Test Custom", field_count: 4 }] } });
    if (path === "/api/workflows/custom/test.json") {
      return route.fulfill({ json: { name: "custom/test.json", workflow: { "10": { class_type: "KSampler", inputs: {} }, "11": { class_type: "CLIPTextEncode", inputs: {} }, "12": { class_type: "LoadImage", inputs: {} } }, config: { title: "Test Custom", fields: [
        { id: "style", node: "11", input: "text", name: "Style", type: "prompt", default: "editorial" },
        { id: "image", node: "12", input: "image", name: "Image", type: "image" },
        { id: "steps", node: "10", input: "steps", name: "Steps", type: "number", default: 7 },
        { id: "seed", node: "10", input: "seed", name: "Seed", type: "number", default: 42, random_enabled: true }
      ] }, builtin: false } });
    }
    if (path === "/api/canvas-llm") {
      state.llmPayloads.push(request.postDataJSON());
      if (state.failNextLlm) {
        state.failNextLlm = false;
        return route.fulfill({ status: 500, json: { detail: "LLM mock failure" } });
      }
      return route.fulfill({ json: { text: "Final polished prompt", model: "gpt-test", raw_usage: { total_tokens: 9 } } });
    }
    if (path === "/api/upload") {
      return route.fulfill({ json: { files: [{ comfy_name: "uploaded-ref.png" }] } });
    }
    if (path === "/api/ai/upload") {
      const index = state.aiUploadPayloads.length + 1;
      state.aiUploadPayloads.push({ method: request.method(), contentType: request.headers()["content-type"] || "" });
      return route.fulfill({ json: { files: [{ url: `/output/editor-${index}.png`, name: `editor-${index}.png` }] } });
    }
    if (path === "/api/canvas-image-tasks" && request.method() === "POST") {
      state.imageTaskPayloads.push(request.postDataJSON());
      if (state.failNextImageTask) {
        state.failNextImageTask = false;
        return route.fulfill({ status: 500, json: { detail: "Image task mock failure" } });
      }
      return route.fulfill({ json: { task_id: `task-${state.imageTaskPayloads.length}`, status: "queued" } });
    }
    const taskMatch = path.match(/^\/api\/canvas-image-tasks\/(.+)$/);
    if (taskMatch) return route.fulfill({ json: { task_id: taskMatch[1], status: "succeeded", result: { images: ["/output/generated.png"], status: "succeeded", model: "gpt-image-2", task_id: taskMatch[1] } } });
    if (path === "/api/generate") {
      state.workflowPayloads.push(request.postDataJSON());
      if (state.failNextWorkflow) {
        state.failNextWorkflow = false;
        return route.fulfill({ status: 500, json: { detail: "Workflow mock failure" } });
      }
      return route.fulfill({ json: { images: ["/output/workflow.png"], status: "succeeded", task_id: "workflow-task", model: "Z-Image.json" } });
    }
    if (path === "/api/canvas-video") {
      state.videoPayloads.push(request.postDataJSON());
      if (state.failNextVideo) {
        state.failNextVideo = false;
        return route.fulfill({ status: 500, json: { detail: "Video mock failure" } });
      }
      return route.fulfill({ json: { videos: ["/output/video.mp4"], task_id: "video-task", raw: { ok: true } } });
    }
    if (path === "/generate") {
      state.msgenPayloads.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { url: "/output/msgen.png", status: "succeeded", task_id: "msgen-task" } });
    }
    if (path === "/api/angle/generate") {
      state.msgenPayloads.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { url: "/output/qwen.png", status: "succeeded", task_id: "qwen-task" } });
    }
    if (path === "/api/ms/generate") {
      state.msgenPayloads.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { url: "/output/klein.png", status: "succeeded", task_id: "klein-task" } });
    }
    if (path === "/api/canvas-assets/check") {
      state.assetCheckPayloads.push(request.postDataJSON());
      return route.fulfill({ json: { exists: { "/output/existing.png": true, "/output/generated.png": true, "/output/workflow.png": true, "/output/video.mp4": true } } });
    }
    if (path === "/api/canvas-assets/download") {
      state.assetDownloadPayloads.push(request.postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/zip", body: Buffer.from("zip") });
    }
    if (path === "/api/download-output") return route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from("asset") });

    return route.continue();
  });
}

test("native Canvas complete migration QA", async ({ page }) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const state = {
    canvases: [baseCanvas()],
    staticCanvasRequests: 0,
    savePayloads: [],
    llmPayloads: [],
    imageTaskPayloads: [],
    workflowPayloads: [],
    videoPayloads: [],
    msgenPayloads: [],
    assetCheckPayloads: [],
    assetDownloadPayloads: [],
    aiUploadPayloads: [],
    failNextLlm: false,
    failNextImageTask: false,
    failNextWorkflow: false,
    failNextVideo: false
  };
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await setupRoutes(page, state);

  await page.goto(`${BASE}/app/canvas`);
  await expect(page.locator('[data-node-id="gen-1"][role="button"]')).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(state.staticCanvasRequests).toBe(0);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-complete-desktop-light.png`, fullPage: true });

  await page.getByLabel("Canvas title").fill("Native Canvas QA Renamed");
  await page.getByLabel("Zoom in").click();
  await page.getByLabel("Reset viewport").click();

  await page.locator('[data-node-id="llm-1"][role="button"]').click();
  await page.getByRole("button", { name: "Run LLM node" }).click();
  await expect(page.getByLabel("Selected LLM output text")).toHaveValue("Final polished prompt");

  await page.locator('[data-node-id="gen-1"][role="button"]').click();
  await page.getByRole("button", { name: "Run workflow node" }).click();
  await expect.poll(() => state.imageTaskPayloads.length).toBeGreaterThan(0);
  expect(state.imageTaskPayloads.at(-1).prompt).toContain("Final polished prompt");
  expect(state.imageTaskPayloads.at(-1).prompt).not.toContain("stale text");
  expect(state.imageTaskPayloads.at(-1).prompt).not.toContain("stale prompt");
  expect(state.imageTaskPayloads.at(-1).prompt).not.toContain("stale chat");
  await page.locator('[data-node-id="right-1"][role="button"]').click();
  await expect(page.getByLabel("Selected node name")).toHaveValue("Right side QA");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-llm-to-generator.png`, fullPage: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-image-result.png`, fullPage: true });

  await page.locator('[data-node-id="workflow-1"][role="button"]').click();
  await expect(page.getByLabel("Custom workflow parameters")).toBeVisible();
  await page.getByLabel("Custom workflow Steps").fill("9");
  await page.getByRole("button", { name: "Run workflow node" }).click();
  await expect.poll(() => state.workflowPayloads.length).toBeGreaterThan(0);
  expect(state.workflowPayloads.at(-1).workflow_json).toBe("custom/test.json");
  expect(state.workflowPayloads.at(-1).params["10"].steps).toBe(9);
  expect(state.workflowPayloads.at(-1).params["12"].image).toBeTruthy();
  await page.locator('[data-node-type="output"] .qc-canvas-output-thumb[aria-label="Preview output workflow.png"]').click();
  await expect(page.getByRole("dialog", { name: "Canvas output preview" })).toBeVisible();
  await page.getByRole("button", { name: "Compare output" }).click();
  await expect(page.getByLabel("Output compare slider")).toBeVisible();
  await page.getByLabel("Output compare slider").fill("72");
  const compareAlignment = await page.locator(".qc-canvas-output-compare__frame").evaluate((frame) => {
    const generated = frame.querySelector('[data-compare-layer="generated"]')?.getBoundingClientRect();
    const source = frame.querySelector('[data-compare-layer="source"]')?.getBoundingClientRect();
    const sourceClip = frame.querySelector(".qc-canvas-output-compare__source")?.getBoundingClientRect();
    const slider = frame.querySelector("span")?.getBoundingClientRect();
    return {
      generated: generated ? { x: generated.x, y: generated.y, width: generated.width, height: generated.height } : null,
      source: source ? { x: source.x, y: source.y, width: source.width, height: source.height } : null,
      sourceClip: sourceClip ? { x: sourceClip.x, y: sourceClip.y, width: sourceClip.width, height: sourceClip.height } : null,
      slider: slider ? { x: slider.x, width: slider.width } : null
    };
  });
  expect(compareAlignment.generated).toBeTruthy();
  expect(compareAlignment.source).toBeTruthy();
  expect(compareAlignment.sourceClip).toBeTruthy();
  expect(Math.abs(compareAlignment.generated.width - compareAlignment.source.width)).toBeLessThan(1);
  expect(Math.abs(compareAlignment.generated.height - compareAlignment.source.height)).toBeLessThan(1);
  expect(Math.abs(compareAlignment.generated.x - compareAlignment.source.x)).toBeLessThan(1);
  expect(Math.abs(compareAlignment.generated.y - compareAlignment.source.y)).toBeLessThan(1);
  expect(Math.abs(compareAlignment.generated.width - compareAlignment.sourceClip.width)).toBeLessThan(1);
  expect(Math.abs((compareAlignment.slider.x + compareAlignment.slider.width / 2) - (compareAlignment.generated.x + compareAlignment.generated.width * 0.72))).toBeLessThan(2);
  await page.getByLabel("Close output preview").click();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-workflow-result.png`, fullPage: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-custom-workflow.png`, fullPage: true });

  await page.locator('[data-node-id="image-1"] .qc-canvas-media-button').click();
  await expect(page.getByRole("dialog", { name: "Canvas image editor" })).toBeVisible();
  await page.getByRole("button", { name: "Apply image edit" }).click();
  await expect.poll(() => state.aiUploadPayloads.length).toBeGreaterThanOrEqual(1);
  await page.locator('[data-node-id="image-1"][role="button"]').click({ position: { x: 24, y: 18 } });
  await expect(page.getByLabel("Selected node image URL")).toHaveValue("/output/editor-1.png");

  await page.locator('[data-node-id="image-1"] .qc-canvas-media-button').click();
  await page.getByRole("tab", { name: "Mask" }).click();
  const maskSurface = page.getByLabel("Mask drawing surface");
  const maskBox = await maskSurface.boundingBox();
  expect(maskBox).toBeTruthy();
  await maskSurface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [
      ["pointerdown", rect.left + rect.width * 0.25, rect.top + rect.height * 0.25, 1],
      ["pointermove", rect.left + rect.width * 0.65, rect.top + rect.height * 0.65, 1],
      ["pointerup", rect.left + rect.width * 0.65, rect.top + rect.height * 0.65, 0]
    ];
    for (const [type, clientX, clientY, buttons] of points) {
      element.dispatchEvent(new PointerEvent(String(type), {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: Number(buttons),
        clientX: Number(clientX),
        clientY: Number(clientY)
      }));
    }
  });
  await page.getByRole("button", { name: "Apply image edit" }).click();
  await expect.poll(() => state.aiUploadPayloads.length).toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel("Selected node image URL")).toHaveValue("/output/editor-2.png");

  await page.locator('[data-node-id="image-1"] .qc-canvas-media-button').click();
  await page.getByRole("tab", { name: "Split" }).click();
  await page.getByLabel("Grid rows").fill("2");
  await page.getByLabel("Grid columns").fill("2");
  await expect(page.getByLabel("Grid X cuts")).toHaveAttribute("placeholder", /25.*0\.25/);
  await page.getByLabel("Grid X cuts").fill("0.25");
  await page.getByLabel("Grid Y cuts").fill("50%");
  await page.getByRole("button", { name: "Apply image edit" }).click();
  await expect.poll(() => state.aiUploadPayloads.length).toBeGreaterThanOrEqual(6);

  await page.locator('[data-node-id="video-1"][role="button"]').click();
  await page.getByRole("button", { name: "Run video node" }).click();
  await expect.poll(() => state.videoPayloads.length).toBeGreaterThan(0);
  expect(state.videoPayloads.at(-1).images[0].role).toBe("first_frame");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-video-result.png`, fullPage: true });

  await page.locator('[data-node-id="msgen-1"][role="button"]').click();
  await page.getByRole("button", { name: "Run ModelScope node" }).click();
  await expect.poll(() => state.msgenPayloads.length).toBeGreaterThan(0);
  expect(state.msgenPayloads.at(-1).path).toBe("/generate");

  const imageTaskCount = state.imageTaskPayloads.length;
  await page.locator('[data-node-id="prompt-1"][role="button"]').click();
  await page.getByRole("button", { name: "Run selected" }).click();
  await expect.poll(() => state.imageTaskPayloads.length).toBeGreaterThan(imageTaskCount);

  await page.getByRole("button", { name: "Loop", exact: true }).click();
  await expect(page.getByText("Loop preview")).toBeVisible();
  await page.getByRole("button", { name: "Prompt group", exact: true }).click();
  await expect(page.getByLabel("Selected node name")).toHaveValue("Prompt group");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-node-types.png`, fullPage: true });

  await page.locator('[data-node-id="prompt-1"] [data-canvas-handle="output"]').dispatchEvent("pointerdown", { pointerId: 1, clientX: 300, clientY: 120, button: 0 });
  await page.locator('[data-node-id="output-1"] [data-canvas-handle="input"]').dispatchEvent("pointerup", { pointerId: 1, clientX: 430, clientY: 840, button: 0 });
  await page.locator("svg .qc-canvas-link-path").first().click({ force: true });
  await page.getByRole("button", { name: "Delete selected link" }).click();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-links.png`, fullPage: true });

  await page.getByRole("button", { name: "Check local assets" }).click();
  await expect.poll(() => state.assetCheckPayloads.length).toBeGreaterThan(0);
  expect(state.assetCheckPayloads.at(-1).urls.every((url) => url.startsWith("/output/"))).toBe(true);
  await page.getByRole("button", { name: "Download all local" }).click();
  await expect.poll(() => state.assetDownloadPayloads.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => state.savePayloads.length).toBeGreaterThan(0);
  const saved = state.savePayloads.at(-1);
  expect(saved.title).toBe("Native Canvas QA Renamed");
  expect(saved.nodes.find((node) => node.id === "prompt-1").unknownNodeField).toBe("keep-node");
  expect(saved.nodes.find((node) => node.id === "llm-1").outputText).toBe("Final polished prompt");
  expect(saved.nodes.find((node) => node.id === "video-1").videos).toContain("/output/video.mp4");
  expect(saved.nodes.find((node) => node.id === "image-1").url).toBe("/output/editor-1.png");
  expect(saved.nodes.some((node) => node.role === "mask" && node.url === "/output/editor-2.png")).toBe(true);
  expect(saved.nodes.filter((node) => typeof node.gridTile === "string").length).toBeGreaterThanOrEqual(4);
  expect(saved.nodes.some((node) => node.imageComparisons?.["/output/workflow.png"])).toBe(true);
  expect(saved.viewport.unknownViewport).toBe(true);
  expect(saved.logs[0].keep).toBe(true);
  expect(saved.settings.legacySetting).toBe(true);
  await page.reload();
  await expect(page.locator('[data-node-id="llm-1"][role="button"]')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-save-reload.png`, fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("studio_theme", "dark");
    localStorage.setItem("canvas_theme", "dark");
  });
  await page.reload();
  await expect(page.locator('[data-node-id="gen-1"][role="button"]')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-complete-desktop-dark.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem("studio_theme", "light");
    localStorage.setItem("canvas_theme", "light");
  });
  await page.reload();
  await expect(page.locator('[data-node-id="gen-1"][role="button"]')).toBeVisible();
  const overflowLight = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowLight).toBe(false);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-complete-mobile-light.png`, fullPage: true });
  await page.evaluate(() => {
    localStorage.setItem("studio_theme", "dark");
    localStorage.setItem("canvas_theme", "dark");
  });
  await page.reload();
  await expect(page.locator('[data-node-id="gen-1"][role="button"]')).toBeVisible();
  const overflowDark = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowDark).toBe(false);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/native-canvas-complete-mobile-dark.png`, fullPage: true });

  for (const route of ["/app/generate", "/app/enhance", "/app/edit", "/app/online", "/app/angle", "/app/chat", "/app/gallery", "/app/canvas", "/app/api-models", "/app/comfyui"]) {
    await page.goto(`${BASE}${route}`);
    await expect(page.locator("iframe")).toHaveCount(0);
  }

  expect(state.staticCanvasRequests).toBe(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("native Canvas lifecycle QA", async ({ page }) => {
  const state = {
    canvases: [baseCanvas()],
    staticCanvasRequests: 0,
    savePayloads: [],
    llmPayloads: [],
    imageTaskPayloads: [],
    workflowPayloads: [],
    videoPayloads: [],
    msgenPayloads: [],
    assetCheckPayloads: [],
    assetDownloadPayloads: [],
    aiUploadPayloads: [],
    failNextLlm: false,
    failNextImageTask: false,
    failNextWorkflow: false,
    failNextVideo: false
  };
  await setupRoutes(page, state);

  await page.goto(`${BASE}/app/canvas`);
  await page.getByRole("button", { name: "New canvas" }).first().click();
  await expect(page.getByLabel("Canvas title")).toBeVisible();
  await expect(page.getByLabel("Canvas title")).toHaveValue(/Canvas /);
  await page.getByLabel("Canvas title").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("Lifecycle Canvas");
  await expect(page.getByLabel("Canvas title")).toHaveValue("Lifecycle Canvas");
  await expect(page.getByText("Unsaved").first()).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => state.savePayloads.at(-1)?.title).toBe("Lifecycle Canvas");

  await page.getByLabel("Move Lifecycle Canvas to trash").click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => Boolean(state.canvases.find((canvas) => canvas.id === "canvas-created")?.deleted_at)).toBe(true);

  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByLabel("Restore Lifecycle Canvas").click();
  await expect.poll(() => Boolean(state.canvases.find((canvas) => canvas.id === "canvas-created")?.deleted_at)).toBe(false);

  await page.getByLabel("Move Lifecycle Canvas to trash").click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => Boolean(state.canvases.find((canvas) => canvas.id === "canvas-created")?.deleted_at)).toBe(true);
  await page.getByLabel("Permanently delete Lifecycle Canvas").click();
  await page.getByRole("button", { name: "Purge" }).click();
  await expect.poll(() => state.canvases.some((canvas) => canvas.id === "canvas-created")).toBe(false);
  expect(state.staticCanvasRequests).toBe(0);
});

test("native Canvas execution failure QA", async ({ page }) => {
  const state = {
    canvases: [baseCanvas()],
    staticCanvasRequests: 0,
    savePayloads: [],
    llmPayloads: [],
    imageTaskPayloads: [],
    workflowPayloads: [],
    videoPayloads: [],
    msgenPayloads: [],
    assetCheckPayloads: [],
    assetDownloadPayloads: [],
    aiUploadPayloads: [],
    failNextLlm: false,
    failNextImageTask: false,
    failNextWorkflow: false,
    failNextVideo: false
  };
  await setupRoutes(page, state);

  await page.goto(`${BASE}/app/canvas`);
  await page.locator('[data-node-id="llm-1"][role="button"]').click();
  state.failNextLlm = true;
  await page.getByRole("button", { name: "Run LLM node" }).click();
  await expect(page.getByText(/LLM mock failure/).first()).toBeVisible();

  await page.locator('[data-node-id="gen-1"][role="button"]').click();
  state.failNextImageTask = true;
  await page.getByRole("button", { name: "Run workflow node" }).click();
  await expect(page.getByText(/Image task mock failure/).first()).toBeVisible();

  await page.locator('[data-node-id="workflow-1"][role="button"]').click();
  state.failNextWorkflow = true;
  await page.getByRole("button", { name: "Run workflow node" }).click();
  await expect(page.getByText(/Workflow mock failure/).first()).toBeVisible();

  await page.locator('[data-node-id="video-1"][role="button"]').click();
  state.failNextVideo = true;
  await page.getByRole("button", { name: "Run video node" }).click();
  await expect(page.getByText(/Video mock failure/).first()).toBeVisible();

  await page.locator('[data-node-id="prompt-1"][role="button"]').click();
  state.failNextImageTask = true;
  await page.getByRole("button", { name: "Run selected" }).click();
  await expect(page.getByText(/Image task mock failure/).first()).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => state.savePayloads.length).toBeGreaterThan(0);
  const saved = state.savePayloads.at(-1);
  expect(saved.nodes.find((node) => node.id === "llm-1").runError).toContain("LLM mock failure");
  expect(saved.nodes.find((node) => node.id === "gen-1").runError).toContain("Image task mock failure");
  expect(saved.nodes.find((node) => node.id === "workflow-1").runError).toContain("Workflow mock failure");
  expect(saved.nodes.find((node) => node.id === "video-1").runError).toContain("Video mock failure");
  expect(state.staticCanvasRequests).toBe(0);
});
