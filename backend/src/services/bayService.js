/**
 * Bay Service
 *
 * Contains ALL business logic and database operations for the Bay module.
 * Controllers must never call Prisma directly — they must go through this
 * service. This keeps the service independently testable and replaceable.
 *
 * Throws AppError instances for expected failure scenarios so the global
 * error handler can produce the correct HTTP response.
 *
 * polygonCoordinates handling:
 *   - Accepted as an optional field in create and update payloads.
 *   - Stored as-is (Json type in Prisma/PostgreSQL).
 *   - null means "no physical boundary defined for this bay".
 *   - Validation of the coordinate structure is done in the validator layer
 *     before reaching this service.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { ensureZoneByName } = require('./zoneService');

/**
 * Fetch every bay ordered by creation date (newest first).
 *
 * @returns {Promise<Bay[]>}
 */
const getAllBays = async () => {
  return prisma.bay.findMany({
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Fetch a single bay by its UUID primary key.
 *
 * @param {string} id
 * @returns {Promise<Bay>}
 * @throws {AppError} 404 if not found
 */
const getBayById = async (id) => {
  const bay = await prisma.bay.findUnique({ where: { id } });

  if (!bay) {
    throw new AppError(`Bay with ID "${id}" was not found.`, 404);
  }

  return bay;
};

/**
 * Create a new bay.
 * Checks for bayCode uniqueness before attempting the insert so we can
 * return a meaningful 409 rather than a raw Prisma constraint error.
 *
 * @param {object} data - Validated payload from the controller.
 * @returns {Promise<Bay>}
 * @throws {AppError} 409 if bayCode already exists
 */
const createBay = async (data) => {
  const {
    bayCode,
    bayName,
    zone,
    latitude,
    longitude,
    status,
    polygonCoordinates = null,   // optional — defaults to null
  } = data;

  // Explicit uniqueness check — gives us control over the error message.
  const existing = await prisma.bay.findUnique({ where: { bayCode } });
  if (existing) {
    throw new AppError(
      `Bay Code "${bayCode}" is already in use. Please choose a unique code.`,
      409
    );
  }

  // The zone label is linked to its Zone row (registered by name if new).
  return prisma.$transaction(async (tx) => {
    const zoneRecord = await ensureZoneByName(tx, zone);
    return tx.bay.create({
      data: {
        bayCode,
        bayName,
        zone,
        zoneId:             zoneRecord.id,
        latitude:           parseFloat(latitude),
        longitude:          parseFloat(longitude),
        polygonCoordinates: polygonCoordinates ?? null,
        status,
      },
    });
  });
};

/**
 * Update an existing bay by ID.
 * Checks existence first (404) then validates bayCode uniqueness against
 * other records (ignoring the record being updated) to prevent false 409s.
 *
 * @param {string} id
 * @param {object} data - Validated payload from the controller.
 * @returns {Promise<Bay>}
 * @throws {AppError} 404 if not found, 409 if bayCode already taken
 */
const updateBay = async (id, data) => {
  const {
    bayCode,
    bayName,
    zone,
    latitude,
    longitude,
    status,
    polygonCoordinates = null,   // optional — preserve existing if not sent
  } = data;

  // Ensure the record exists
  const existing = await prisma.bay.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(`Bay with ID "${id}" was not found.`, 404);
  }

  // Check if bayCode is taken by a DIFFERENT record
  if (bayCode !== existing.bayCode) {
    const codeConflict = await prisma.bay.findUnique({ where: { bayCode } });
    if (codeConflict) {
      throw new AppError(
        `Bay Code "${bayCode}" is already in use. Please choose a unique code.`,
        409
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const zoneRecord = await ensureZoneByName(tx, zone);
    return tx.bay.update({
      where: { id },
      data: {
        bayCode,
        bayName,
        zone,
        zoneId:             zoneRecord.id,
        latitude:           parseFloat(latitude),
        longitude:          parseFloat(longitude),
        polygonCoordinates: polygonCoordinates ?? null,
        status,
      },
    });
  });
};

/**
 * Delete a bay by ID.
 * Checks existence first to return a clear 404 rather than a Prisma error.
 *
 * NOTE: If Material-Bay Mappings exist for this bay, Prisma will throw a
 * foreign key constraint error (P2003). The global error handler maps this
 * to a 400 response. A future enhancement could surface a friendlier message.
 *
 * @param {string} id
 * @returns {Promise<Bay>} The deleted record
 * @throws {AppError} 404 if not found
 */
const deleteBay = async (id) => {
  const existing = await prisma.bay.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(`Bay with ID "${id}" was not found.`, 404);
  }

  return prisma.bay.delete({ where: { id } });
};

module.exports = {
  getAllBays,
  getBayById,
  createBay,
  updateBay,
  deleteBay,
};
