/**
 * Zone Service
 *
 * Configurable warehouse zones. A zone's `name` is mirrored on Bay.zone (the
 * long-standing label used across the app), so renaming a zone renames the
 * label on its bays in the same transaction.
 *
 * Coordinates and rail/road connectivity are optional: null means "not
 * configured" and the recommendation engine applies no restriction for it.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const ZONE_INCLUDE = {
  _count: { select: { bays: true, loadingDocks: true } },
};

const pickZoneData = (data) => ({
  name: data.name,
  description: data.description ?? null,
  latitude: data.latitude ?? null,
  longitude: data.longitude ?? null,
  railConnected: data.railConnected ?? null,
  roadConnected: data.roadConnected ?? null,
});

const getAllZones = () =>
  prisma.zone.findMany({ include: ZONE_INCLUDE, orderBy: { name: 'asc' } });

const getZoneById = async (id) => {
  const zone = await prisma.zone.findUnique({ where: { id }, include: ZONE_INCLUDE });
  if (!zone) throw new AppError(`Zone with ID "${id}" was not found.`, 404);
  return zone;
};

const createZone = async (data) => {
  const existing = await prisma.zone.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError(`Zone "${data.name}" already exists.`, 409);
  return prisma.zone.create({ data: pickZoneData(data), include: ZONE_INCLUDE });
};

const updateZone = async (id, data) =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.zone.findUnique({ where: { id } });
    if (!existing) throw new AppError(`Zone with ID "${id}" was not found.`, 404);

    if (data.name !== existing.name) {
      const clash = await tx.zone.findUnique({ where: { name: data.name } });
      if (clash) throw new AppError(`Zone "${data.name}" already exists.`, 409);
    }

    const zone = await tx.zone.update({ where: { id }, data: pickZoneData(data), include: ZONE_INCLUDE });

    // Keep the Bay.zone label in step with the zone it belongs to.
    if (data.name !== existing.name) {
      await tx.bay.updateMany({ where: { zoneId: id }, data: { zone: data.name } });
    }
    return zone;
  });

const deleteZone = async (id) => {
  const zone = await getZoneById(id);
  if (zone._count.bays > 0 || zone._count.loadingDocks > 0) {
    throw new AppError(
      `Zone "${zone.name}" still has ${zone._count.bays} bay(s) and ${zone._count.loadingDocks} loading dock(s). ` +
      'Reassign them before deleting the zone.',
      409
    );
  }
  await prisma.zone.delete({ where: { id } });
};

/**
 * Resolve (or register) the Zone row for a bay's zone label inside a
 * transaction. Registering only stores the name — nothing else is assumed.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} name
 */
const ensureZoneByName = (tx, name) =>
  tx.zone.upsert({ where: { name }, update: {}, create: { name } });

module.exports = {
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  ensureZoneByName,
};
