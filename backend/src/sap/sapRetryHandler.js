/**
 * SAP Retry Handler
 *
 * Enterprise-grade transient-failure handling for SAP calls. Wraps an async
 * operation with bounded exponential backoff. The number of attempts and base
 * delay come from env (SAP_MAX_RETRIES, SAP_RETRY_BASE_DELAY_MS).
 *
 * It only retries transient errors (network/timeout/5xx/simulated outage) — not
 * deterministic business failures — and reports the attempt count so the caller
 * can persist it on the sync log.
 */

'use strict';

const env = require('../config/env');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decide whether an error is worth retrying. */
const isTransient = (err) => {
  if (!err) return false;
  if (err.sapUnavailable) return true;
  if (err.code && ['ECONNABORTED', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.code)) return true;
  const status = err.response?.status;
  if (status && status >= 500) return true; // 5xx is transient; 4xx is not
  return false;
};

/**
 * Run `fn` with retries.
 * @param {() => Promise<any>} fn
 * @param {{ maxRetries?: number, baseDelayMs?: number, onAttempt?: (n:number)=>void }} [opts]
 * @returns {Promise<{ result: any, attempts: number }>}
 * @throws the last error (with `.attempts` attached) when all attempts fail
 */
const withRetry = async (fn, opts = {}) => {
  const maxRetries = opts.maxRetries ?? env.SAP_MAX_RETRIES;
  const baseDelay = opts.baseDelayMs ?? env.SAP_RETRY_BASE_DELAY_MS;

  let attempt = 0;
  let lastErr;
  while (attempt < maxRetries) {
    attempt += 1;
    if (opts.onAttempt) opts.onAttempt(attempt);
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt >= maxRetries) break;
      await sleep(baseDelay * 2 ** (attempt - 1)); // exponential backoff
    }
  }
  if (lastErr) lastErr.attempts = attempt;
  throw lastErr;
};

module.exports = { withRetry, isTransient };
