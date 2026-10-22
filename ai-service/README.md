# WareTrace AI Surveillance Service

The Python AI worker for the WareTrace surveillance module. It is the **reusable
foundation** for every AI use case — the first detector is **motion detection**;
future detectors (wall intrusion, face, geo-fence, vehicle, over-speed, driver
monitoring) plug into the same pipeline by adding a detector + a rule.

It lives inside the WareTrace project (not a separate repo), runs as an ordinary
Python process, and talks to the Node backend over HTTP with a shared service
token. No model training. It runs natively (`python main.py`) or as the `ai-worker` container of
the root `docker-compose.yml`; see [docs/TECHNICAL.md](../docs/TECHNICAL.md#ai-worker).

## Architecture

```
ai-service/
  main.py                 entry point: signal handling + lifecycle
  config.py               env-driven configuration (no hard-coded cameras)
  camera/
    video_source.py       resilient cv2.VideoCapture wrapper (file/stream/webcam)
    camera_manager.py     discovers cameras, runs one pipeline per camera
  detectors/
    base_detector.py      BaseDetector + DetectionResult  (the detector contract)
    motion_detector.py    OpenCV MOG2 background-subtraction motion detector
  rules/
    base_rule.py          BaseRule + RuleContext + RuleResult
    rule_engine.py        generic engine: register rules, evaluate context
    schedule.py           operational-hours / "warehouse closed" helper
    motion_rule.py        IF closed AND motion THEN raise MOTION alert
  alerts/
    evidence.py           snapshot (JPEG) capture, region annotation
    alert_reporter.py     builds payload + posts to backend (+ local cooldown)
  pipeline/
    camera_pipeline.py    read → detect → rules → alert → publish state
  utils/
    api_client.py         backend HTTP client (service token)
    logger.py             logging setup
```

### Data flow

1. The worker pulls **camera jobs** from `GET /api/surveillance/ai/cameras`
   (only cameras with motion **enabled**), each with a resolved capture source
   and motion config.
2. Per camera, `CameraPipeline` reads frames, runs the `MotionDetector`, and
   feeds results into the `RuleEngine`.
3. `MotionClosedRule` fires when the warehouse is **closed** (outside
   operational hours, or `armed=always`) **and** motion is present.
4. A JPEG **snapshot** is captured and the alert is posted to
   `POST /api/surveillance/ai/alerts`. The backend persists it as a
   `SurveillanceAlert`, stores the evidence, de-duplicates, and audits.
5. A heartbeat (`POST /api/surveillance/ai/heartbeat`) publishes liveness +
   live per-camera motion state for the dashboard.

## Run

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
cp .env.example .env        # set WARETRACE_API_URL and AI_SERVICE_TOKEN
python main.py
```

`AI_SERVICE_TOKEN` must match the backend's `AI_SERVICE_TOKEN`. Enable motion on
a camera from the camera's detail page (or `PUT /api/surveillance/cameras/:id/motion-config`).
For development, associate an uploaded video with a camera and the worker treats
it exactly like a live feed.

## Extending (future use cases)

Adding a new AI use case does **not** change the core:

1. Add a detector in `detectors/` implementing `BaseDetector.process(frame)`.
2. Add a rule in `rules/` implementing `BaseRule.evaluate(ctx)`.
3. Register them in `CameraPipeline` (driven by camera config) and add the new
   `alertType` value in the backend enum.

The camera input layer, rule engine, evidence capture, alert reporting,
heartbeat, reconnection and dashboard are all reused unchanged.
