ARG PYTHON_VERSION=3.12-slim

FROM python:${PYTHON_VERSION} AS deps

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Herramientas de RESPALDO (misma imagen para API, worker y scheduler):
# - postgresql-client (v17 en trixie): pg_dump/pg_restore sirven contra el Postgres 16
#   del stack (pg_dump debe ser >= a la versión del servidor). Sin repos externos.
# - age: cifrado del archivo de respaldo con la clave PÚBLICA del administrador (la
#   privada nunca entra a la imagen ni al repositorio).
# Red intermitente en el despliegue: apt y pip reintentan varias veces, y la caché
# de pip persiste entre reintentos (BuildKit cache mount, no queda en la imagen)
# para reanudar la descarga en vez de re-bajar todo si la conexión se corta.
RUN apt-get update -o Acquire::Retries=5 \
    && apt-get install -y --no-install-recommends -o Acquire::Retries=5 postgresql-client age \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
ENV PIP_RETRIES=10 PIP_DEFAULT_TIMEOUT=120
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

FROM deps AS dev
COPY . backend/
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM deps AS prod
COPY . backend/
EXPOSE 8000
CMD ["gunicorn", "backend.app.main:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "4"]
