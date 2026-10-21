/**
 * collectRawBody — buffer a raw binary request body with an enforced size cap.
 *
 * Used only by the demo-video upload route. The global express.json/urlencoded
 * parsers ignore binary content types (video/*, application/octet-stream), so
 * the request stream is intact here. The upload aborts early the moment the
 * configured maximum is exceeded — it never accumulates an oversized payload.
 *
 * Dependency-free by design (no multer/busboy): the client sends the file as
 * the raw request body with `?filename=` carrying the original name.
 */

'use strict';

const env = require('../config/env');
const { sendError } = require('../utils/responseHelper');

const collectRawBody = (req, res, next) => {
  const max = env.VIDEO_MAX_BYTES;
  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > max) {
      aborted = true;
      sendError(res, 413, `Video exceeds the maximum size of ${Math.round(max / (1024 * 1024))} MB.`);
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    req.rawBody = Buffer.concat(chunks, size);
    next();
  });

  req.on('error', () => {
    if (aborted) return;
    aborted = true;
    sendError(res, 400, 'Upload stream failed.');
  });
};

module.exports = collectRawBody;
