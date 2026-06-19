# Quiet Creative OS Design System

**Version**: 3.0
**Product**: Infinite Canvas / Feebee Studios
**Status**: New direction, replacing the Mistral-faithful v2 design language.
**Reference mood**: ChatGPT workspace, Codex desktop, Linear, Raycast, Figma side panels, modern AI creation tools.

Quiet Creative OS is a calm, modern interface system for an AI image and canvas workbench. It should feel fast, focused, and durable enough to keep open all day.

The old system was intentionally loud: cream grid paper, hard corners, pixel SVGs, orange accents, and editorial contrast. The new system is intentionally quieter. It prioritizes speed, scanability, reusable surfaces, and clear task flow over brand-heavy decoration.

One sentence:

> A lightweight creative operating system: quiet surfaces, precise controls, soft hierarchy, strong workflow continuity.

---

## 1. Product Intent

This is not a landing page and not a visual effects showcase. It is a production workspace for generating, editing, enhancing, arranging, and reviewing AI images.

The design must optimize for:

1. Long sessions without visual fatigue.
2. Fast switching between generation, editing, canvas, gallery, chat, and provider settings.
3. Shared controls for models, uploads, history, task progress, and API status.
4. Dense information without feeling cramped.
5. A premium AI-tool feeling without decorative noise.

The user should feel that the app is an instrument, not a website.

---

## 2. Design Principles

### 2.1 Quiet By Default

Most surfaces should be neutral. Use contrast and color only where they carry workflow meaning: primary actions, active route, generation state, errors, selected assets, and task progress.

Avoid:

- Large decorative gradients.
- Persistent background animation.
- Hero sections inside tools.
- Heavy borders everywhere.
- Brand motifs that compete with content.

### 2.2 Workbench, Not Pages

The app should read as one continuous workspace. Navigation changes context, but global concepts remain stable:

- Current project or canvas.
- Active model/provider.
- Queue and task state.
- Recent outputs.
- API/model health.
- Theme and account/config state.

Page-level islands should be reduced over time. Shared behavior belongs in shared components or stores.

### 2.3 Content Is The UI

Images, prompts, model choices, canvas nodes, task states, and history entries are the primary visual material. Chrome should frame them, not compete with them.

### 2.4 Soft Hierarchy

Hierarchy comes from spacing, surface elevation, font weight, and muted contrast. It should not rely on large headlines, black blocks, or hard color jumps.

### 2.5 Fast Interaction

Motion should clarify state. It should not advertise itself.

Use motion for:

- Opening and closing panels.
- Drag/drop affordance.
- Task progress.
- Streaming chat.
- Upload completion.
- Selection changes.

Avoid motion for:

- Decorative entrances on every view.
- Cursor trails.
- Constant shimmer.
- Background loops.

Respect `prefers-reduced-motion`.

---

## 3. Visual Direction

### 3.1 Overall Feel

The interface should feel closer to:

- ChatGPT's calm conversational workspace.
- Codex's practical project/thread surface.
- Linear's precise density and command-oriented rhythm.
- Figma's editor-like panels and canvas-first behavior.

It should not feel like:

- A marketing homepage.
- A cyberpunk dashboard.
- A Mistral homage.
- A generic shadcn demo.
- A toy image generator.

### 3.2 Signature Element

The memorable element is the **Creation Rail**: a persistent right-side or bottom adaptive rail showing recent outputs, running tasks, and selected asset context.

This replaces the old pixel/brand motif. It is functional and distinctive because the product is about iterative visual creation.

Creation Rail behavior:

- Shows queued/running/completed tasks.
- Shows recent generated assets.
- Supports drag into canvas or reference inputs.
- Collapses to compact thumbnails.
- Expands into detailed metadata and actions.
- Is shared across Generate, Edit, Enhance, Canvas, Gallery, and Chat where relevant.

---

## 4. Color System

### 4.1 Light Theme

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#f7f7f4` | App background |
| `--surface` | `#ffffff` | Primary panels and cards |
| `--surface-2` | `#f1f1ed` | Secondary panels, inactive controls |
| `--surface-3` | `#e8e8e1` | Hover and selected neutral surfaces |
| `--text` | `#151515` | Primary text |
| `--text-muted` | `#6f716d` | Secondary text |
| `--text-soft` | `#9a9d96` | Metadata, placeholders |
| `--border` | `#deded6` | Hairline borders |
| `--border-strong` | `#c9c9bf` | Active borders, splitters |
| `--accent` | `#2f6fed` | Primary action and active route |
| `--accent-soft` | `#e8f0ff` | Selected background |
| `--success` | `#238a58` | Completed states |
| `--warning` | `#b7791f` | Warnings and retries |
| `--danger` | `#d64545` | Errors and destructive actions |

### 4.2 Dark Theme

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#101112` | App background |
| `--surface` | `#181a1b` | Primary panels |
| `--surface-2` | `#202326` | Secondary panels |
| `--surface-3` | `#2a2e31` | Hover and selected neutral surfaces |
| `--text` | `#f2f3ef` | Primary text |
| `--text-muted` | `#a5a8a1` | Secondary text |
| `--text-soft` | `#73776f` | Metadata |
| `--border` | `#303335` | Hairline borders |
| `--border-strong` | `#464b4e` | Active borders, splitters |
| `--accent` | `#7aa7ff` | Primary action and active route |
| `--accent-soft` | `#1c2b44` | Selected background |
| `--success` | `#5fc58b` | Completed states |
| `--warning` | `#d6a94a` | Warnings and retries |
| `--danger` | `#ff7474` | Errors |

### 4.3 Color Rules

- Accent color should stay below roughly 5% of the screen.
- Do not use blue/purple/cyan gradients as a default visual identity.
- Do not tint every card with accent color.
- Use semantic colors only for status.
- Dark mode should be calm graphite, not pure black neon.

---

## 5. Typography

Primary font:

- `Inter`, `Geist`, `Helvetica Neue`, `Arial`, system sans-serif.

Mono font:

- `JetBrains Mono`, `IBM Plex Mono`, `ui-monospace`, `Menlo`, monospace.

| Token | Size | Weight | Line height | Use |
|---|---:|---:|---:|---|
| `text-title` | 24px | 620 | 1.2 | View title, modal title |
| `text-section` | 17px | 600 | 1.35 | Panel section title |
| `text-body` | 14px | 400 | 1.45 | Main UI copy |
| `text-label` | 12px | 560 | 1.25 | Labels, tabs, toolbar text |
| `text-meta` | 12px | 400 | 1.3 | Metadata |
| `text-mono` | 12px | 450 | 1.4 | IDs, status, logs |

Rules:

- No hero-scale typography in tool views.
- Use sentence case for UI text.
- Prefer concise labels over explanatory prose.
- Use tabular numbers for queue, image dimensions, costs, timings, and counters.

---

## 6. Layout Model

### 6.1 App Shell

Current desktop layout:

```text
┌────────────┬────────────────────────────────────┐
│ Sidebar    │ Top context bar                    │
│            ├────────────────────────────────────┤
│ Routes     │ Main workbench                     │
│ Settings   │                                    │
│ Status     │                                    │
└────────────┴────────────────────────────────────┘

Creation Rail opens from the TopBar as an overlay drawer on desktop/tablet and a bottom sheet on mobile. It must never resize the main workspace.
```

Shell regions:

- Sidebar: routes, compact provider/API health, appearance, settings.
- Top context bar: current view, model/provider selector, command actions, queue state.
- Main workbench: active workflow.
- Creation Rail: overlay outputs, tasks, selected asset details.

### 6.2 Responsive Behavior

- Desktop: sidebar + main; Creation Rail opens as a right overlay drawer.
- Tablet: sidebar collapses to icon rail; Creation Rail remains a right overlay drawer.
- Mobile: bottom navigation; Creation Rail becomes a bottom sheet.

### 6.3 Spacing

Use a 4px base scale:

| Token | Value |
|---|---:|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |

Most dense tool panels should use 12px or 16px internal spacing. Avoid 32px padding inside repeated cards.

---

## 7. Surfaces And Radius

### 7.1 Radius Scale

| Token | Value | Use |
|---|---:|---|
| `--radius-sm` | 6px | Small controls, chips |
| `--radius-md` | 10px | Inputs, buttons, thumbnails |
| `--radius-lg` | 14px | Panels, drawers, cards |
| `--radius-xl` | 18px | Large modals and sheets only |

Rules:

- Rounded UI is allowed and expected.
- Avoid pill controls unless the shape communicates a compact toggle/chip.
- Do not use `rounded-full` for ordinary buttons.

### 7.2 Elevation

Elevation is functional, not decorative.

| Token | Value | Use |
|---|---|---|
| `--shadow-popover` | `0 8px 24px rgba(15, 15, 15, .10)` | Menus, popovers |
| `--shadow-dialog` | `0 20px 60px rgba(15, 15, 15, .18)` | Modals |
| `--shadow-none` | `none` | Default panels/cards |

Default panels should rely on border and background, not shadow.

---

## 8. Controls

### 8.1 Buttons

Primary:

- Background `--text`, text `--bg` in light.
- Background `--text`, text `--bg` in dark.
- Radius `--radius-md`.
- Height 36px or 40px.
- Used for one main action in a panel.

Secondary:

- Background `--surface-2`.
- Text `--text`.
- Border `1px solid var(--border)`.
- Used for normal actions.

Ghost:

- Transparent background.
- Hover `--surface-2`.
- Used in toolbars and rows.

Danger:

- Use semantic danger color only for confirmed destructive actions.

### 8.2 Inputs

- Height 36px for single-line controls.
- Radius `--radius-md`.
- Background `--surface`.
- Border `1px solid var(--border)`.
- Focus ring: `0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)`.

### 8.3 Selects, Menus, Comboboxes

Use native controls only for simple cases. For model/provider selectors, use searchable combobox behavior.

Expected model selector behavior:

- Search by provider/model name.
- Show provider group.
- Show configured/unconfigured state.
- Remember recent models.
- Do not bury API setup in a separate page only.

### 8.4 Tabs And Segmented Controls

- Tabs switch major local modes inside a panel.
- Segmented controls switch small mutually exclusive settings.
- Active state should use `--accent-soft` and a stronger text color.

### 8.5 Sliders And Steppers

Use direct numeric input with steppers for dimensions, counts, seed, strength, and steps. Sliders are acceptable when the value is perceptual, such as denoise or guidance.

---

## 9. Icons

The new system allows modern line icons.

Preferred icon sources:

- Lucide.
- Phosphor.
- Radix icons.

Rules:

- Icons should be 16px or 18px in dense controls.
- Use 20px for sidebar route icons.
- No pixel icon requirement.
- No decorative icon wall.
- Icons must not replace text when the action is ambiguous; use tooltip or label.

---

## 10. View Patterns

### 10.1 Generate

Generate should be a focused split workspace:

```text
┌───────────────┬──────────────────────────────┬────────────────┐
│ Prompt/config │ Results grid / preview       │ Rail opens from top bar │
│ Model         │                              │                         │
│ Size          │                              │                         │
│ References    │                              │                         │
└───────────────┴──────────────────────────────┴────────────────┘
```

The prompt panel should remain stable while results update.

### 10.2 Edit / Enhance / Angle

These should share the same pattern:

- Left: input assets and parameters.
- Center: before/after preview.
- Rail: output/task drawer or sheet opened from the shell.

Do not build each as a visually unrelated page.

### 10.3 Chat

Chat should feel like a workspace assistant, not a separate app.

Expected behavior:

- Conversation list collapses.
- Message stream is centered and readable.
- Reference images and generated outputs can be attached from Creation Rail.
- Tool progress appears inline and in the global task rail.

### 10.4 Canvas

Canvas is the primary deep workspace.

Expected layout:

- Canvas takes the largest area.
- Node creation and command tools live in a compact toolbar.
- Inspector opens only when useful.
- Creation Rail supports dragging generated assets into the canvas.
- Minimap is optional, not default visual noise.

### 10.5 Gallery

Gallery is a library, not a dump.

Expected behavior:

- Filter by source, model, date, favorite, type, and canvas.
- Batch select.
- Drag assets to canvas or reference inputs.
- Show generation metadata on demand.

---

## 11. Motion

Motion should be short and stateful:

| Interaction | Duration | Easing |
|---|---:|---|
| Hover | 80-120ms | ease-out |
| Panel open | 140-180ms | cubic-bezier(.2,.8,.2,1) |
| Modal open | 160-220ms | cubic-bezier(.2,.8,.2,1) |
| Toast | 160ms | ease-out |
| Drag hover | Immediate to 80ms | ease-out |

Rules:

- No perpetual animation except loading/progress.
- No cursor trails.
- No decorative particle systems.
- No text scrambling for normal UI.

---

## 12. Copywriting

Tone:

- Plain.
- Direct.
- Operational.

Prefer:

- `Generate`
- `Enhance`
- `Use as reference`
- `Send to canvas`
- `Retry`
- `Model not configured`

Avoid:

- Marketing slogans.
- Apologies in errors.
- Explanatory paragraphs inside dense panels.
- Clever labels that slow recognition.

Error copy should name the failure and next action:

- `Model key missing. Add a key to run this model.`
- `Upload failed. Check the file type and try again.`
- `ComfyUI is offline. Start an instance or switch provider.`

---

## 13. Accessibility

Minimum requirements:

- Keyboard navigation for all toolbar actions, menus, tabs, dialogs, and upload controls.
- Visible focus ring using `--accent`.
- Semantic buttons, inputs, labels, and dialogs.
- Color contrast AA for text and controls.
- `prefers-reduced-motion` support.
- Image thumbnails must have meaningful alt text or empty alt when decorative.
- Destructive actions require confirmation when data is not recoverable.

---

## 14. Implementation Direction

The long-term frontend target is:

- FastAPI remains the backend API and static host.
- A Vite + React + TypeScript frontend becomes the primary app shell.
- Static HTML fallbacks for Angle, API / Models, ComfyUI, and Canvas remain directly accessible as compatibility references, but their app routes are native.
- Canvas has a native React foundation; full Canvas execution-node depth is migrated incrementally.
- Shared API, provider, upload, history, queue, and theme logic move into frontend modules.
- Radix/shadcn-style primitives may be used for behavior, but visual styling belongs to this design system.
- React Bits is not a base library for this product. It may be sampled only as a one-off inspiration after review.

### 14.1 Preferred Frontend Modules

```text
frontend/
  src/
    app/
      App.tsx
      routes.tsx
    components/
      shell/
      controls/
      creation-rail/
      upload/
      gallery/
    features/
      generate/
      chat/
      canvas/
      providers/
      settings/
    lib/
      api.ts
      task-stream.ts
      storage.ts
      theme.ts
    styles/
      tokens.css
      globals.css
```

### 14.2 Migration Rule

Do not rewrite everything at once.

Recommended order:

1. New shell and design tokens.
2. Shared API client, theme, queue, provider state.
3. Generate / Enhance / Edit / Online / Chat.
4. Gallery and Creation Rail.
5. Remove visible fallback clutter and retired routes.
6. Native Canvas foundation.
7. Canvas execution-node decomposition.
8. Angle native migration.
9. API / Models and ComfyUI native migrations.

---

## 15. Review Checklist

A change is aligned with Quiet Creative OS when:

- It makes the app feel calmer, faster, and easier to scan.
- It reduces duplicated page-level behavior.
- It preserves or improves the workflow path from prompt to output to canvas.
- It does not add decorative motion or brand-heavy styling.
- It uses shared tokens and components.
- It keeps generated images and working context as the visual focus.
- It works in light and dark modes.
- It has clear keyboard/focus behavior for new controls.

A change should be rejected or revised when:

- It reintroduces Mistral/pixel/hard-corner constraints as a default.
- It adds a new standalone page island without shared shell integration.
- It makes common actions harder to reach.
- It hides model/provider/task state.
- It relies on animation to look modern.
- It creates another one-off control style.

---

## 16. Non-Goals

- Do not build a landing page.
- Do not adopt React Bits as the UI foundation.
- Do not use Next.js unless a future deployment requirement proves SSR is needed.
- Do not migrate the entire canvas without a dedicated audit/spike.
- Do not remove existing static files until replacement routes and backend cleanup are verified.
- Do not change backend API schemas during visual migration unless a task explicitly calls for it.
