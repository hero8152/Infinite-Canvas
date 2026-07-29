FROM python:3.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DREAMINA_BIN=/usr/local/bin/dreamina \
    PATH="/usr/local/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin appuser

RUN curl -fsSL https://jimeng.jianying.com/cli -o /tmp/install-dreamina.sh \
    && HOME=/home/appuser DREAMINA_INSTALL_DIR=/usr/local/bin bash /tmp/install-dreamina.sh \
    && rm -f /tmp/install-dreamina.sh \
    && test -x /usr/local/bin/dreamina \
    && cp -a /home/appuser/.dreamina_cli /opt/dreamina-cli-template \
    && chown -R appuser:appuser /home/appuser/.dreamina_cli /home/appuser/.profile

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY docker-entrypoint.py /usr/local/bin/docker-entrypoint.py
COPY . .

RUN mkdir -p API data assets/input assets/output assets/library output workflows/custom \
    && sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.py \
    && chmod +x /usr/local/bin/docker-entrypoint.py \
    && chown -R appuser:appuser /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/app-info', timeout=3).read()" || exit 1

ENTRYPOINT ["docker-entrypoint.py"]
CMD ["python", "main.py"]
