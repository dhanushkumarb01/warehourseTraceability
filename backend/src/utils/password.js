/**
 * Password Utilities
 *
 * Centralised bcrypt hashing/verification. Plaintext passwords are never stored
 * or logged. Cost factor comes from env (BCRYPT_SALT_ROUNDS).
 */

'use strict';

const bcrypt = require('bcrypt');
const env = require('../config/env');

/**
 * Hash a plaintext password.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash
 */
const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);

/**
 * Compare a plaintext password against a stored hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, verifyPassword };
