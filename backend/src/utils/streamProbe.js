/**
 * streamProbe — real upstream reachability checks for the streaming layer.
 *
 * Self-contained, dependency-free probes used by the stream drivers to decide
 * whether a camera source is reachable before a session is marked ONLINE.
 * Results are never faked: a TCP connect / HTTP request is actually attempted.
 *
 * This intentionally mirrors (but does not import) the camera "Test Connection"
 * probe so the streaming layer stays decoupled from the registration module.
 */

'use strict';

const net = require('net');

/**
 * Attempt a raw TCP connection (used for RTSP:554 / RTMP:1935 reachability).
 * @returns {Promise<{ok:boolean, message:string}>}
 */
const probeTcp = (host, port, timeoutMs) => new Promise((resolve) => {
  const socket = new net.Socket();
  let settled = false;
  const done = (ok, message) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve({ ok, message });
  };
  socket.setTimeout(timeoutMs);
  socket.once('connect', () => done(true, `Reachable at ${host}:${port}.`));
  socket.once('timeout', () => done(false, `No response from ${host}:${port} within ${timeoutMs} ms.`));
  socket.once('error', (err) => {
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') done(false, `Host "${host}" could not be resolved.`);
    else if (err.code === 'ECONNREFUSED') done(false, `Connection refused at ${host}:${port}.`);
    else done(false, err.message);
  });
  try {
    socket.connect(port, host);
  } catch (err) {
    done(false, err.message);
  }
});

/**
 * Attempt an HTTP request (used for HTTP/MJPEG reachability). Treats 401/403 as
 * an authentication failure rather than unreachable.
 * @returns {Promise<{ok:boolean, message:string, auth?:boolean}>}
 */
const probeHttp = async (url, username, password, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {};
  if (username) {
    const token = Buffer.from(`${username}:${password || ''}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (res.status === 401 || res.status === 403) return { ok: false, auth: true, message: `Authentication failed (HTTP ${res.status}).` };
    if (res.ok || (res.status >= 200 && res.status < 400)) return { ok: true, message: `Stream endpoint responded (HTTP ${res.status}).` };
    return { ok: false, message: `Endpoint returned HTTP ${res.status}.` };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, message: `No response within ${timeoutMs} ms.` };
    return { ok: false, message: err.message };
  } finally {
    clearTimeout(timer);
  }
};

/** Parse a URL safely, returning null on failure. */
const safeUrl = (value) => {
  try { return new URL(value); } catch { return null; }
};

module.exports = { probeTcp, probeHttp, safeUrl };
