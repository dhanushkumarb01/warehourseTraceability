/**
 * Loading Dock Service
 *
 * Configurable loading docks. A dock may belong to a zone (serving that zone's
 * bays) or be shared (zoneId null — used by zones without a dock of their own).
 * Coordinates are optional until surveyed; a dock without them is never used
 * for distance calculation. `arrivalModes` lists the routes it receives; an
 * empty list means "not configured".
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const DOCK_INCLUDE = {
  zone: { select: { id: true, name: true } },
  _count: { select: { allocations: true } },
};

const pickDockData = (data) => ({
  dockCode: data.dockCode,
  dockName: data.dockName,
  zoneId: data.zoneId || null,
  latitude: data.latitude ?? null,
  longitude: data.longitude ?? null,
  arrivalModes: [...new Set(data.arrivalModes || [])],
  status: data.status || 'ACTIVE',
  notes: data.notes ?? null,
});

const assertZoneExists = async (zoneId) => {
  if (!zoneId) return;
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone) throw new AppError(`Zone with ID "${zoneId}" was not found.`, 400);
};

const getAllDocks = () =>
  prisma.loadingDock.findMany({ include: DOCK_INCLUDE, orderBy: { dockCode: 'asc' } });

const getDockById = async (id) => {
  const dock = await prisma.loadingDock.findUnique({ where: { id }, include: DOCK_INCLUDE });
  if (!dock) throw new AppError(`Loading dock with ID "${id}" was not found.`, 404);
  return dock;
};

const createDock = async (data) => {
  const existing = await prisma.loadingDock.findUnique({ where: { dockCode: data.dockCode } });
  if (existing) throw new AppError(`Dock code "${data.dockCode}" is already in use.`, 409);
  await assertZoneExists(data.zoneId);
  return prisma.loadingDock.create({ data: pickDockData(data), include: DOCK_INCLUDE });
};

const updateDock = async (id, data) => {
  const existing = await prisma.loadingDock.findUnique({ where: { id } });
  if (!existing) throw new AppError(`Loading dock with ID "${id}" was not found.`, 404);
  if (data.dockCode !== existing.dockCode) {
    const clash = await prisma.loadingDock.findUnique({ where: { dockCode: data.dockCode } });
    if (clash) throw new AppError(`Dock code "${data.dockCode}" is already in use.`, 409);
  }
  await assertZoneExists(data.zoneId);
  return prisma.loadingDock.update({ where: { id }, data: pickDockData(data), include: DOCK_INCLUDE });
};

const deleteDock = async (id) => {
  const dock = await getDockById(id);
  if (dock._count.allocations > 0) {
    throw new AppError(
      `Dock "${dock.dockCode}" is referenced by ${dock._count.allocations} bay allocation(s). ` +
      'Set it to Inactive instead so the allocation history stays intact.',
      409
    );
  }
  await prisma.loadingDock.delete({ where: { id } });
};

module.exports = { getAllDocks, getDockById, createDock, updateDock, deleteDock };
