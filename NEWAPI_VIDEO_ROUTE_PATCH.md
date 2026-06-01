# NewAPI Video Route Compatibility Patch

This repository adds a narrowly scoped compatibility patch for video APIs
exposed through some NewAPI relay deployments.

## Problem

Some NewAPI relays return `404 Invalid URL` for the standard video creation
endpoint:

```text
POST /v1/videos/generations
```

The same relay may expose a compatible route instead:

```text
POST /v1/video/generations
POST /v1/videos
```

## Behavior

The patch tries the next creation route only when the previous route clearly
returns a route-missing `404 Invalid URL` response.

It does not resubmit requests after quota errors, parameter errors, or upstream
service failures.

Video task polling also supports:

```text
GET /v1/videos/{task_id}
GET /v1/video/generations/{task_id}
```

## Scope

The functional code change is limited to `main.py`.

This repository does not include local API keys, provider configuration,
Dreamina CLI account scripts, desktop-local files, logs, or backups.
