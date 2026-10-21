/**
 * JWT Utilities
 *
 * Thin, centralised wrapper around jsonwebtoken so signing/verifying options
 * live in exactly one place. The secret and lifetime come from env.js — never
 * hardcoded.
 */

'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Sign an access token for a user.
 * The payload is intentionally minimal — never include the password hash or
 * other sensitive fields. `sub` is the user id (standard JWT claim).
 *
 * @param {{ id: string, role: string, username: string }} user
 * @returns {string} signed JWT
 */
const signToken = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

/**
 * Verify and decode a token. Throws if invalid/expired (caught by middleware).
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET);

module.exports = { signToken, verifyToken };
