/**
 * Crypto Box — symmetric encryption for sensitive at-rest secrets.
 *
 * Used to encrypt camera stream passwords so they are never stored or returned
 * in plaintext. AES-256-GCM (authenticated encryption) with a key derived from
 * CAMERA_ENC_KEY (or JWT_SECRET as a fallback so the app works out of the box).
 *
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 *
 * Note: rotating the key invalidates previously-stored ciphertexts (they would
 * need re-encryption). Documented for production key management.
 */

'use strict';

const crypto = require('crypto');
const env = require('../config/env');

// 32-byte key derived deterministically from the configured secret.
const KEY = crypto.createHash('sha256').update(String(env.CAMERA_ENC_KEY || env.JWT_SECRET)).digest();

/**
 * Encrypt a plaintext string. Returns null for empty input.
 * @param {string} plain
 * @returns {string|null}
 */
const encrypt = (plain) => {
  if (plain === undefined || plain === null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
};

/**
 * Decrypt a ciphertext produced by encrypt(). Returns null on empty/invalid.
 * @param {string} payload
 * @returns {string|null}
 */
const decrypt = (payload) => {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
};

module.exports = { encrypt, decrypt };
