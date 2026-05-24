FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY docker-entrypoint.py /usr/local/bin/docker-entrypoint.py
COPY main.py VERSION ./
COPY static ./static
COPY workflows ./workflows

RUN mkdir -p API data assets/input assets/output assets/library output workflows/custom \
    && chmod +x /usr/local/bin/docker-entrypoint.py \
    && chown -R appuser:appuser /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/app-info', timeout=3).read()" || exit 1

ENTRYPOINT ["docker-entrypoint.py"]
CMD ["python", "main.py"]
