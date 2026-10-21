/**
 * streamDrivers — per-stream-type source drivers for the streaming layer.
 *
 * A driver is a thin, stateless adapter that knows two things about one camera:
 *   - describe(): how the FRONTEND should obtain playback (never any secret) —
 *                 always through a backend path, never the raw camera URL.
 *   - connect():  a REAL reachability check against the upstream source.
 *
 * The session manager owns lifecycle, reconnection and reference counting; the
 * driver only abstracts the differences between source types. This is the seam
 * that lets a production media gateway (FFmpeg → HLS/WebRTC) drop in later for
 * RTSP/RTMP without touching the manager, the API, or the frontend.
 *
 * Credentials are passed in-memory only and are NEVER placed in a descriptor.
 */

'use strict';

const fs = require('fs');
const env = require('../config/env');
const storageService = require('./storageService');
const { probeTcp, probeHttp, safeUrl } = require('../utils/streamProbe');

const DEFAULT_PORTS = { RTSP: 554, RTMP: 1935 };
const VIDEO_MIME = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg',
  mov: 'video/quartz-movie', m4v: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
};

const mimeFor = (name) => VIDEO_MIME[String(name || '').split('.').pop().toLowerCase()] || 'video/mp4';

/** Build the backend playback path for a camera (frontend never sees the source). */
const playbackPath = (id) => `/api/streams/${id}/playback`;
const manifestPath = (id) => `/api/streams/${id}/manifest.m3u8`;

/**
 * Uploaded video — behaves like a live feed but is served from storage with
 * range support. Genuinely "online" the moment a file is associated.
 */
function uploadedVideoDriver(camera) {
  return {
    kind: 'file',
    describe() {
      return {
        kind: 'file',
        playbackPath: playbackPath(camera.id),
        mime: mimeFor(camera.videoFileName),
        fileName: camera.videoFileName || null,
        loop: true, // loop so a finite demo clip behaves like a continuous stream
      };
    },
    async connect() {
      if (!camera.videoFilePath) {
        return { ok: false, message: 'No demo video is associated with this camera yet.' };
      }
      const abs = storageService.getFilePath(camera.videoFilePath);
      if (!fs.existsSync(abs)) {
        return { ok: false, message: 'Associated video file is missing from storage.' };
      }
      return { ok: true, message: 'Demo video ready.', metrics: {} };
    },
  };
}

/**
 * Local webcam — captured client-side via getUserMedia. Still a first-class
 * session for health/consistency; playback is flagged client-side so the
 * frontend uses the device directly (a server cannot proxy a client's webcam).
 */
function localWebcamDriver(camera) {
  return {
    kind: 'webcam',
    describe() {
      return { kind: 'webcam', clientSide: true };
    },
    async connect() {
      return { ok: true, message: 'Local webcam handled in the browser.', metrics: {} };
    },
  };
}

/** HTTP / MJPEG — backend proxies the upstream so the browser never connects directly. */
function httpDriver(camera, creds) {
  return {
    kind: 'proxy',
    describe() {
      return { kind: 'proxy', playbackPath: playbackPath(camera.id) };
    },
    async connect() {
      if (!camera.streamUrl) return { ok: false, message: 'No stream URL configured.' };
      if (!safeUrl(camera.streamUrl)) return { ok: false, message: 'The stream URL could not be parsed.' };
      const r = await probeHttp(camera.streamUrl, creds.username, creds.password, env.STREAM_CONNECT_TIMEOUT_MS);
      return { ok: r.ok, auth: r.auth, message: r.message, metrics: {} };
    },
  };
}

/**
 * RTSP / RTMP — not natively playable in browsers. The backend verifies
 * reachability now; transcoded playback is delegated to a pluggable gateway.
 *   - STREAM_GATEWAY_MODE='hls' + STREAM_GATEWAY_BASE_URL set → HLS manifest.
 *   - otherwise → reachable, "awaiting media gateway" (production seam ready).
 */
function networkDriver(camera) {
  const port = (() => {
    const parsed = safeUrl(camera.streamUrl);
    return parsed && Number(parsed.port) ? Number(parsed.port) : DEFAULT_PORTS[camera.streamType] || 0;
  })();

  const gatewayConfigured = env.STREAM_GATEWAY_MODE === 'hls' && Boolean(env.STREAM_GATEWAY_BASE_URL);

  return {
    kind: gatewayConfigured ? 'hls' : 'gateway',
    describe() {
      return gatewayConfigured
        ? { kind: 'hls', manifestPath: manifestPath(camera.id), gatewayConfigured: true }
        : { kind: 'gateway', gatewayConfigured: false, gatewayPending: true, protocol: camera.streamType };
    },
    async connect() {
      if (!camera.streamUrl) return { ok: false, message: 'No stream URL configured.' };
      const parsed = safeUrl(camera.streamUrl);
      if (!parsed || !parsed.hostname || !port) return { ok: false, message: 'The stream URL is missing a host or port.' };
      const r = await probeTcp(parsed.hostname, port, env.STREAM_CONNECT_TIMEOUT_MS);
      // Reachable upstream but no transcoder yet is still a healthy "connected"
      // state for monitoring — the gateway seam handles actual media delivery.
      return { ok: r.ok, message: r.ok && !gatewayConfigured ? `${r.message} Awaiting media gateway for playback.` : r.message, metrics: {} };
    },
  };
}

/**
 * Build the driver for a camera. `creds` carries the decrypted username/password
 * in-memory only — it is used for upstream probing/proxying and never exposed.
 */
function createDriver(camera, creds = {}) {
  switch (camera.streamType) {
    case 'UPLOADED_VIDEO': return uploadedVideoDriver(camera);
    case 'LOCAL_WEBCAM':   return localWebcamDriver(camera);
    case 'HTTP':           return httpDriver(camera, creds);
    case 'RTSP':
    case 'RTMP':           return networkDriver(camera);
    default:               return httpDriver(camera, creds);
  }
}

module.exports = { createDriver, mimeFor };
