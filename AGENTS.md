# Infinite Canvas Agent Instructions

## Provider Configuration

- Use `scripts/configure_provider.py` instead of hand-editing `data/api_providers.json` or `API/.env`.
- Keep secrets only in `API/.env` or environment variables; never commit real keys.
- Public provider metadata lives in `data/api_providers.json`, but that file is local runtime state and ignored by git.
- Frontend provider/model selectors read `/api/config`, so a provider added through the CLI should reflect in API Settings, Online Image, GPT Chat, and Canvas after refresh or provider-change broadcast.
- Read `docs/API.md` before changing provider schema, endpoint shapes, or model classification rules.
- Read `docs/AGENT_PROVIDER_SETUP.md` before adding a new custom provider.

## Verification

Run these before claiming provider/config work is complete:

```bash
python3 tests/test_agent_provider_config.py -v
python3 tests/test_sidebar_pin_static.py -v
.venv/bin/python tests/test_runtime_env_values.py -v
.venv/bin/python tests/test_image_size_normalization.py -v
git diff --check
gitnexus detect-changes --repo Infinite-Canvas
```

Provider runtime functions such as `normalize_provider`, `get_api_provider`, `generate_ai_image`, and `resolve_chat_provider` have broad blast radius. Run GitNexus impact first and add focused tests before editing them.

## GitNexus

Use GitNexus as the first pass for non-trivial code work:

```bash
gitnexus status
gitnexus analyze --embeddings --skills
gitnexus query "provider configuration flow"
gitnexus impact main.py
gitnexus detect-changes --repo Infinite-Canvas
```

GitNexus helps map blast radius, but it does not replace reading files, running tests, and doing runtime checks. Do not commit local `.gitnexus/` or generated agent skill caches.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Infinite-Canvas** (1261 symbols, 2367 relationships, 109 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Infinite-Canvas/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Infinite-Canvas/clusters` | All functional areas |
| `gitnexus://repo/Infinite-Canvas/processes` | All execution flows |
| `gitnexus://repo/Infinite-Canvas/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Tests area (50 symbols) | `.claude/skills/generated/tests/SKILL.md` |
| Work in the Static area (27 symbols) | `.claude/skills/generated/static/SKILL.md` |
| Work in the Scripts area (20 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Cluster_30 area (15 symbols) | `.claude/skills/generated/cluster-30/SKILL.md` |
| Work in the Cluster_2 area (14 symbols) | `.claude/skills/generated/cluster-2/SKILL.md` |
| Work in the Cluster_1 area (13 symbols) | `.claude/skills/generated/cluster-1/SKILL.md` |
| Work in the Cluster_32 area (13 symbols) | `.claude/skills/generated/cluster-32/SKILL.md` |
| Work in the Cluster_3 area (12 symbols) | `.claude/skills/generated/cluster-3/SKILL.md` |
| Work in the Cluster_35 area (10 symbols) | `.claude/skills/generated/cluster-35/SKILL.md` |
| Work in the Cluster_11 area (8 symbols) | `.claude/skills/generated/cluster-11/SKILL.md` |
| Work in the Cluster_12 area (8 symbols) | `.claude/skills/generated/cluster-12/SKILL.md` |
| Work in the Cluster_13 area (8 symbols) | `.claude/skills/generated/cluster-13/SKILL.md` |
| Work in the Cluster_42 area (8 symbols) | `.claude/skills/generated/cluster-42/SKILL.md` |
| Work in the Cluster_31 area (7 symbols) | `.claude/skills/generated/cluster-31/SKILL.md` |
| Work in the Cluster_0 area (5 symbols) | `.claude/skills/generated/cluster-0/SKILL.md` |
| Work in the Cluster_34 area (5 symbols) | `.claude/skills/generated/cluster-34/SKILL.md` |
| Work in the Cluster_10 area (4 symbols) | `.claude/skills/generated/cluster-10/SKILL.md` |

<!-- gitnexus:end -->
