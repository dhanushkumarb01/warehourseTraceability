/**
 * Stream Controller (Phase 12) — HTTP layer for the live streaming module.
 *
 * Thin handlers over streamService. Media endpoints (playback / manifest) serve
 * bytes directly and therefore manage their own responses; everything else uses
 * the shared response envelope. The frontend always talks to these endpoints —
 * never to a camera directly.
 */

'use strict';

const fs = require('fs');
const { Readable } = require('stream');

const streamService = require('../services/streamService');
const env = require('../config/env');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const { mimeFor } = require('../services/streamDrivers');

/** Stable per-viewer id: user + client-supplied tab id (keeps refcounts honest). */
const viewerKey = (req) => `${req.user.id}:${(req.body && req.body.viewerId) || req.query.viewerId || 'web'}`;

const live = async (req, res) => {
  const data = await streamService.listLive(req.query);
  sendSuccess(res, 200, 'Live camera states retrieved.', data);
};

const open = async (req, res) => {
  const data = await streamService.openStream(req.params.id, viewerKey(req), req.user.id);
  sendSuccess(res, 200, 'Stream opened.', data);
};

const close = async (req, res) => {
  const data = await streamService.closeStream(req.params.id, viewerKey(req), req.user.id);
  sendSuccess(res, 200, 'Stream closed.', data);
};

const refresh = async (req, res) => {
  const data = await streamService.refreshStream(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Stream refreshed.', data);
};

const status = async (req, res) => {
  const data = await streamService.getStatus(req.params.id);
  sendSuccess(res, 200, 'Stream status retrieved.', data);
};

const logs = async (req, res) => {
  const data = await streamService.getLogs(req.params.id, req.query.limit);
  sendSuccess(res, 200, 'Connection logs retrieved.', data);
};

// ─── Media delivery ───────────────────────────────────────────────────────────

/** Serve a local file with HTTP range support (smooth seeking, like a live feed). */
const serveFileWithRange = (req, res, absolutePath, fileName) => {
  const stat = fs.statSync(absolutePath);
  const total = stat.size;
  const mime = mimeFor(fileName);
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-store');

  if (!range) {
    res.setHeader('Content-Length', total);
    return fs.createReadStream(absolutePath).pipe(res);
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
  if (Number.isNaN(start) || start < 0) start = 0;
  if (Number.isNaN(end) || end >= total) end = total - 1;
  if (start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`);
    return res.end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', end - start + 1);
  return fs.createReadStream(absolutePath, { start, end }).pipe(res);
};

/**
 * Playback proxy: the single media endpoint the frontend uses. Uploaded videos
 * are served with range support; HTTP/MJPEG cameras are proxied so the browser
 * never connects to the camera directly. RTSP/RTMP playback is delivered via
 * the HLS manifest endpoint (and the production media gateway).
 */
const playback = async (req, res) => {
  // Uploaded video (or any file-backed camera) → range serve.
  try {
    const file = await streamService.resolveVideoFile(req.params.id);
    return serveFileWithRange(req, res, file.absolutePath, file.fileName);
  } catch (err) {
    if (err.statusCode && err.statusCode !== 404) return sendError(res, err.statusCode, err.message);
    // fall through to proxy attempt
  }

  // HTTP/MJPEG → backend proxy.
  let target;
  try {
    target = await streamService.resolveProxyTarget(req.params.id);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message || 'No playable media for this camera.');
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const headers = {};
  if (target.credentials.username) {
    const token = Buffer.from(`${target.credentials.username}:${target.credentials.password || ''}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  try {
    const upstream = await fetch(target.url, { headers, signal: controller.signal });
    if (!upstream.ok && upstream.status >= 400) {
      return sendError(res, 502, `Upstream camera responded with HTTP ${upstream.status}.`);
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    if (upstream.body) {
      Readable.fromWeb(upstream.body).on('error', () => { try { res.end(); } catch { /* ignore */ } }).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // client navigated away
    return sendError(res, 502, `Unable to reach the camera stream: ${err.message}`);
  }
};

/**
 * HLS manifest seam for RTSP/RTMP. When a production media gateway is configured
 * (STREAM_GATEWAY_MODE='hls'), this proxies its manifest. Otherwise it returns a
 * clear 503 so the frontend can show "awaiting media gateway" — the architecture
 * is in place; only the gateway is pending.
 */
const manifest = async (req, res) => {
  if (env.STREAM_GATEWAY_MODE !== 'hls' || !env.STREAM_GATEWAY_BASE_URL) {
    return sendError(res, 503, 'Media gateway is not configured. RTSP/RTMP playback requires an HLS/WebRTC gateway (set STREAM_GATEWAY_MODE=hls and STREAM_GATEWAY_BASE_URL).');
  }
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  try {
    const url = `${env.STREAM_GATEWAY_BASE_URL.replace(/\/$/, '')}/${req.params.id}/index.m3u8`;
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) return sendError(res, 502, `Gateway returned HTTP ${upstream.status}.`);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res); else res.end();
  } catch (err) {
    if (err.name === 'AbortError') return;
    return sendError(res, 502, `Unable to reach media gateway: ${err.message}`);
  }
};

// ─── Demo-video association (admin) ───────────────────────────────────────────

const uploadVideo = async (req, res) => {
  const cam = await streamService.associateVideo(
    req.params.id,
    { buffer: req.rawBody, originalName: req.query.filename },
    req.user.id,
  );
  sendSuccess(res, 200, 'Demo video associated.', cam);
};

const clearVideo = async (req, res) => {
  const cam = await streamService.clearVideo(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Demo video removed.', cam);
};

module.exports = {
  live, open, close, refresh, status, logs, playback, manifest, uploadVideo, clearVideo,
};
