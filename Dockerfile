# Infinite-Canvas  —— 基于 python slim 的轻量镜像
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Pillow 需要的系统图像库
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libjpeg62-turbo libpng16-16 libtiff6 libwebp7 libopenjp2-7 \
        libfreetype6 liblcms2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖清单安装，提升构建缓存命中
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用（.dockerignore 排除了 python/packages 等运行时多余文件）
COPY . .

# 应用固定监听 0.0.0.0:3000
EXPOSE 3000

# 非 root 运行
# 根目录的持久化文件（global_config.json / history.json / API/.env）改为软链接，
# 指向统一的 /app/_state 目录卷内的真实文件。
# 说明：Docker 命名卷首次挂载到“单文件路径”时会创建为目录，导致 code 读到目录而报
# “is not a directory”。因此把这三个文件放进一个目录卷 _state，再用软链接让代码仍以
# 原有绝对路径读写，即可正确按文件持久化。
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/data /app/output /app/assets /app/API /app/_state \
    && chmod 777 /app/_state \
    && touch /app/_state/global_config.json /app/_state/history.json /app/_state/.env \
    && ln -sf /app/_state/global_config.json /app/global_config.json \
    && ln -sf /app/_state/history.json /app/history.json \
    && ln -sf /app/_state/.env /app/API/.env \
    && chown -R appuser:appuser /app
USER appuser

# 应用启动入口（main.py 自带 uvicorn.run，固定 3000）
ENTRYPOINT ["python", "main.py"]
