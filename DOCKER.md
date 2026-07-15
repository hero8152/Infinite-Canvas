# Docker Deployment

Docker support is kept in standalone files to keep runtime deployment separate from the application code.

## Local Build

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:3000/
```

For another computer on the same LAN, use the Docker host IP:

```text
http://<docker-host-lan-ip>:3000/
```

## Using the Published Image

After the GitHub Action runs for a published release, pull from GitHub Container Registry:

```bash
docker pull ghcr.io/hero8152/infinite-canvas:latest
docker compose up -d
```

If the repository owner or name changes, copy `.env.example` to `.env` and update `INFINITE_CANVAS_IMAGE`.

## Runtime Data

`docker-compose.yml` stores user data under `docker-data/`:

```text
docker-data/API/               API keys and generated .env
docker-data/assets/            uploaded assets and generated media
docker-data/data/              conversations, canvases, providers, backups, history, legacy config
docker-data/output/            legacy output files
docker-data/workflows-custom/  uploaded custom workflows
```

Back up `docker-data/` before moving machines or recreating the container.

## ComfyUI Compatibility

The app defaults to `COMFYUI_INSTANCES=host.docker.internal:8188` in Docker because `127.0.0.1` inside a container points to the container, not the host.

Common settings:

```bash
# ComfyUI on the same Docker host
COMFYUI_INSTANCES=host.docker.internal:8188 docker compose up -d

# ComfyUI on another computer
COMFYUI_INSTANCES=192.168.1.20:8188 docker compose up -d
```

ComfyUI must listen on a reachable address, for example:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

## LAN Access and Security

The container publishes `0.0.0.0:3000`, so other computers on the same network can open:

```text
http://<docker-host-lan-ip>:3000/
```

The application has no built-in login or permission system. Do not expose it directly to the public internet unless you put it behind a firewall, VPN, or reverse proxy with authentication.

## GitHub Container Registry

The workflow `.github/workflows/docker-publish.yml` builds `linux/amd64` and `linux/arm64` images.

It pushes images on:

- published GitHub releases
- manual `workflow_dispatch`

For public pulls, make the package public in GitHub: repository page -> Packages -> image package -> Package settings -> Change visibility.
