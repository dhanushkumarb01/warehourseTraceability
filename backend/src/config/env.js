/**
 * Environment Configuration
 *
 * Central module for reading and validating process.env values.
 * Every environment variable consumed by the application is defined here.
 *
 * Rules:
 *   - Required variables throw on startup if missing (fail-fast).
 *   - Optional variables carry explicit defaults documented inline.
 *   - No other file in src/ may read process.env directly — import from here.
 *
 * Adding a new variable:
 *   1. Add it to the correct .env file.
 *   2. Add a property below with its validation/default.
 *   3. Document the expected values per environment.
 */

'use strict';

/**
 * Throw a clear startup error when a required env var is absent.
 * @param {string} name
 * @returns {string}
 */
const required = (name) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[CONFIG] Required environment variable "${name}" is not set. ` +
      `Check your .env file.`
    );
  }
  return value.trim();
};

/**
 * Read an optional env var, returning the provided default when absent.
 * @param {string} name
 * @param {string} defaultValue
 * @returns {string}
 */
const optional = (name, defaultValue) => {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
};

const env = {
  /** Runtime environment: 'development' | 'test' | 'production' */
  NODE_ENV: optional('NODE_ENV', 'development'),

  /** TCP port the Express server listens on. */
  PORT: parseInt(optional('PORT', '5000'), 10),

  /** PostgreSQL connection string. Required. */
  DATABASE_URL: required('DATABASE_URL'),

  /**
   * Origin of the frontend application permitted by CORS.
   * Must be a full URL including protocol and port.
   *
   * Development:  http://localhost:5174
   * Staging:      https://staging.warehouse.company.com
   * Production:   https://warehouse.company.com
   */
  FRONTEND_URL: required('FRONTEND_URL'),

  // ─── Authentication (Phase 7) ───────────────────────────────────────────────

  /**
   * Secret used to sign and verify JWTs. REQUIRED — the app must never run with
   * a hardcoded fallback. Use a long random value (e.g. `openssl rand -hex 48`)
   * and keep it out of version control.
   */
  JWT_SECRET: required('JWT_SECRET'),

  /** Access-token lifetime (vercel/ms format or seconds). Default 8h. */
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '8h'),

  /** bcrypt cost factor. Higher = slower = more secure. Default 12. */
  BCRYPT_SALT_ROUNDS: parseInt(optional('BCRYPT_SALT_ROUNDS', '12'), 10),

  /**
   * One-time admin bootstrap credentials, consumed by `npm run seed:admin`.
   * Optional here so the app boots without them; the seed script validates them.
   */
  BOOTSTRAP_ADMIN_USERNAME: optional('BOOTSTRAP_ADMIN_USERNAME', ''),
  BOOTSTRAP_ADMIN_EMAIL:    optional('BOOTSTRAP_ADMIN_EMAIL', ''),
  BOOTSTRAP_ADMIN_PASSWORD: optional('BOOTSTRAP_ADMIN_PASSWORD', ''),

  // ─── SAP Integration (Phase 8) ──────────────────────────────────────────────

  /**
   * Active SAP connector implementation:
   *   'mock' — in-process simulated SAP (default; no external system needed)
   *   'http' — real SAP via REST at SAP_BASE_URL (switch on go-live)
   * Migration to real SAP is a configuration change, not a code change.
   */
  SAP_MODE: optional('SAP_MODE', 'mock'),

  /** Base URL of the SAP gateway (used by the http connector). */
  SAP_BASE_URL: optional('SAP_BASE_URL', 'http://localhost:5000/sap'),

  /** Auth for the real SAP gateway — never hardcoded; supply per environment. */
  SAP_API_KEY: optional('SAP_API_KEY', ''),
  SAP_CLIENT_ID: optional('SAP_CLIENT_ID', ''),
  SAP_CLIENT_SECRET: optional('SAP_CLIENT_SECRET', ''),

  /** Per-request SAP timeout (ms). */
  SAP_TIMEOUT_MS: parseInt(optional('SAP_TIMEOUT_MS', '8000'), 10),

  /** Retry policy for transient SAP failures. */
  SAP_MAX_RETRIES: parseInt(optional('SAP_MAX_RETRIES', '3'), 10),
  SAP_RETRY_BASE_DELAY_MS: parseInt(optional('SAP_RETRY_BASE_DELAY_MS', '200'), 10),

  /**
   * When SAP is UNREACHABLE (after retries), should operations be blocked?
   *   false (default) — fail safe: warn and allow, so SAP downtime never halts
   *                     the warehouse. Validation failures (e.g. material
   *                     blocked) still BLOCK regardless of this flag.
   *   true            — strict: treat unavailability as a block.
   */
  SAP_BLOCK_ON_UNAVAILABLE: optional('SAP_BLOCK_ON_UNAVAILABLE', 'false') === 'true',

  /** Mock-only: force the mock connector to simulate an outage (for demos/tests). */
  SAP_SIMULATE_DOWN: optional('SAP_SIMULATE_DOWN', 'false') === 'true',

  // ─── Surveillance (Phase 11) ────────────────────────────────────────────────

  /**
   * Secret used to encrypt camera stream passwords at rest (AES-256-GCM).
   * Optional: if unset, a key is derived from JWT_SECRET so the app works out
   * of the box — but set a dedicated, long, random value in production and
   * rotate it independently of the JWT secret.
   */
  CAMERA_ENC_KEY: optional('CAMERA_ENC_KEY', ''),

  /** Timeout (ms) for the camera "Test Connection" probe. */
  CAMERA_TEST_TIMEOUT_MS: parseInt(optional('CAMERA_TEST_TIMEOUT_MS', '6000'), 10),

  // ─── Live Camera Streaming (Phase 12) ───────────────────────────────────────

  /** Delay between automatic reconnection attempts for a dropped stream (ms). */
  STREAM_RECONNECT_INTERVAL_MS: parseInt(optional('STREAM_RECONNECT_INTERVAL_MS', '5000'), 10),

  /** Maximum consecutive reconnection attempts before a stream is marked ERROR. */
  STREAM_MAX_RECONNECT_ATTEMPTS: parseInt(optional('STREAM_MAX_RECONNECT_ATTEMPTS', '10'), 10),

  /** Timeout (ms) for establishing an upstream camera connection. */
  STREAM_CONNECT_TIMEOUT_MS: parseInt(optional('STREAM_CONNECT_TIMEOUT_MS', '8000'), 10),

  /** Cadence (ms) of the background stream-health reconciliation loop. */
  STREAM_HEALTH_POLL_MS: parseInt(optional('STREAM_HEALTH_POLL_MS', '15000'), 10),

  /**
   * How long a stream stays open with zero viewers before it is torn down (ms).
   * Keeps long-running sessions efficient without reconnecting on every view.
   */
  STREAM_IDLE_TIMEOUT_MS: parseInt(optional('STREAM_IDLE_TIMEOUT_MS', '60000'), 10),

  /**
   * Production media-gateway mode for RTSP/RTMP feeds the browser can't play:
   *   'native'  — backend reports reachability; playback awaits a gateway
   *               (default; zero external dependencies).
   *   'hls'     — transcode to HLS via an external FFmpeg/MediaMTX gateway at
   *               STREAM_GATEWAY_BASE_URL. Switching is configuration, not code.
   */
  STREAM_GATEWAY_MODE: optional('STREAM_GATEWAY_MODE', 'native'),

  /** Base URL of the external media gateway (HLS/WebRTC). Empty = not configured. */
  STREAM_GATEWAY_BASE_URL: optional('STREAM_GATEWAY_BASE_URL', ''),

  /** Storage sub-directory (under /storage) for generated HLS segments. */
  STREAM_HLS_DIR: optional('STREAM_HLS_DIR', 'hls'),

  /** Storage sub-directory (under /storage) for uploaded demo videos. */
  VIDEO_UPLOAD_DIR: optional('VIDEO_UPLOAD_DIR', 'videos'),

  /** Maximum accepted uploaded-video size in bytes (default 500 MB). */
  VIDEO_MAX_BYTES: parseInt(optional('VIDEO_MAX_BYTES', '524288000'), 10),

  // ─── AI Surveillance (Phase 13) ─────────────────────────────────────────────

  /**
   * Shared secret presented by the Python AI service (header X-Service-Token)
   * to the internal ingest/heartbeat endpoints. REQUIRED for the AI worker to
   * report alerts; if unset, those internal endpoints are disabled (the rest of
   * the surveillance API keeps working). Use a long random value.
   */
  AI_SERVICE_TOKEN: optional('AI_SERVICE_TOKEN', ''),

  /** Storage sub-directory (under /storage) for alert snapshot evidence. */
  SURVEILLANCE_SNAPSHOT_DIR: optional('SURVEILLANCE_SNAPSHOT_DIR', 'surveillance'),

  /** Body-size limit for the alert ingest endpoint (snapshots are base64). */
  SURVEILLANCE_INGEST_LIMIT: optional('SURVEILLANCE_INGEST_LIMIT', '20mb'),

  /** Default minimum seconds between alerts of the same type per camera (dedup). */
  SURVEILLANCE_DEFAULT_COOLDOWN_SEC: parseInt(optional('SURVEILLANCE_DEFAULT_COOLDOWN_SEC', '30'), 10),

  /**
   * Default warehouse operational window used when a camera has no per-camera
   * override in aiConfig. Motion alarming arms OUTSIDE this window.
   * Times are 24h "HH:MM" local; days are 0=Sun … 6=Sat.
   */
  SURVEILLANCE_OPERATIONAL_START: optional('SURVEILLANCE_OPERATIONAL_START', '08:00'),
  SURVEILLANCE_OPERATIONAL_END: optional('SURVEILLANCE_OPERATIONAL_END', '20:00'),
  SURVEILLANCE_OPERATIONAL_DAYS: optional('SURVEILLANCE_OPERATIONAL_DAYS', '1,2,3,4,5'),

  /** Seconds without an AI heartbeat after which the service is shown OFFLINE. */
  SURVEILLANCE_HEARTBEAT_TIMEOUT_SEC: parseInt(optional('SURVEILLANCE_HEARTBEAT_TIMEOUT_SEC', '30'), 10),

  /**
   * Face enrollment service (Phase 14). The backend POSTs registration images to
   * this AI-worker HTTP endpoint, which returns a face embedding. Only embeddings
   * are stored — never the images. Uses the same AI_SERVICE_TOKEN for auth.
   */
  AI_ENROLLMENT_URL: optional('AI_ENROLLMENT_URL', 'http://localhost:8600'),
  AI_ENROLLMENT_TIMEOUT_MS: parseInt(optional('AI_ENROLLMENT_TIMEOUT_MS', '15000'), 10),

  /** Convenience flag. */
  get isDevelopment() { return this.NODE_ENV === 'development'; },
  get isProduction()  { return this.NODE_ENV === 'production';  },
  get isTest()        { return this.NODE_ENV === 'test';        },
};

module.exports = env;
