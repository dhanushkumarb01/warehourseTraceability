/**
 * Prisma Client Singleton
 *
 * Exports a single PrismaClient instance to be shared across the entire
 * application. Instantiating multiple clients causes connection pool exhaustion
 * in production. All services must import from this file — never instantiate
 * PrismaClient directly.
 *
 * Note: env.js is NOT imported here because Prisma reads DATABASE_URL directly
 * from process.env at the time PrismaClient is constructed. This is by design
 * per the Prisma documentation and cannot be changed without using a custom
 * datasource provider. NODE_ENV is read once and only here as a controlled
 * exception; all other env vars go through env.js.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');

// Prisma log levels vary by environment to avoid noise in production logs.
const logLevels = process.env.NODE_ENV === 'development'
  ? ['warn', 'error']
  : ['error'];

const prisma = new PrismaClient({ log: logLevels });

module.exports = prisma;
