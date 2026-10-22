# WareTrace AI worker — OpenCV + YOLOv8 (ultralytics) + InsightFace, CPU only.
#   docker build -t waretrace-ai-worker ./ai-service
# Model weights (yolov8n.pt, InsightFace buffalo_l) are downloaded at build
# time so the container starts without internet access to model hosts.

# ─── Build: compile wheels into a virtualenv ─────────────────────────────────
FROM python:3.11-slim AS build
# Compiler for any dependency without a prebuilt wheel (older insightface
# releases are source-only); it stays in this stage, not in the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY requirements.txt .
# CPU-only PyTorch wheels (ultralytics dependency) instead of the CUDA build.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
# The code never opens a window, so the GUI build of OpenCV that ultralytics
# pulls in is swapped for the headless build of the same version (no libGL/X11).
RUN version="$(pip show opencv-python | sed -n 's/^Version: //p')" \
 && pip uninstall -y opencv-python opencv-python-headless \
 && pip install --no-deps "opencv-python-headless==${version}"

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM python:3.11-slim
# libgomp1: OpenMP runtime for onnxruntime; libglib2.0-0: required by OpenCV.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 app

COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    YOLO_CONFIG_DIR=/home/app/.config/Ultralytics

WORKDIR /app
RUN chown app:app /app
USER app

# Pre-download model weights: yolov8n.pt into /app (the detectors load it by
# relative path) and buffalo_l into ~/.insightface/models.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
 && python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])" \
 && mkdir -p /app/.cache

COPY --chown=app:app . .

# Face-enrollment API (Flask development server, single process).
EXPOSE 8600

HEALTHCHECK --interval=20s --timeout=10s --start-period=120s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8600/health', timeout=8)" || exit 1

CMD ["python", "main.py"]
