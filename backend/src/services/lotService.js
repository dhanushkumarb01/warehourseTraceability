const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');

const getAllLots = async () => {
  return prisma.materialLot.findMany({
    orderBy: { receivedDate: 'desc' },
    include: {
      material: true
    }
  });
};

const getLotById = async (id) => {
  const lot = await prisma.materialLot.findUnique({
    where: { id },
    include: {
      material: true,
      mappings: {
        include: { bay: true }
      }
    }
  });

  if (!lot) {
    throw new AppError(`Lot with ID "${id}" not found.`, 404);
  }

  return lot;
};

const lotData = ({ lotCode, quantity, unit, receivedDate, status, arrivalMode = null }) => ({
  lotCode,
  quantity,
  unit,
  receivedDate: new Date(receivedDate),
  status: status || 'AVAILABLE',
  // Arrival mode may be captured at receipt; later changes go through the
  // placement workflow so they are locked once a bay is allotted.
  arrivalMode,
  arrivalRecordedAt: arrivalMode ? new Date() : null,
});

/**
 * Create a lot for an existing material (`materialId`), or together with a new
 * material (`material: { materialCode, materialName, materialType, … }`) in one
 * transaction so a half-finished receipt never leaves an orphan material.
 */
const createLot = async (data, actingUserId = null) => {
  const { lotCode, materialId, material: newMaterial } = data;

  const existing = await prisma.materialLot.findUnique({ where: { lotCode } });
  if (existing) {
    throw new AppError(`Lot Code "${lotCode}" is already in use.`, 409);
  }

  if (newMaterial) {
    const { materialCode, materialName, materialType, manufacturer, supplier, description } = newMaterial;
    const codeTaken = await prisma.material.findUnique({ where: { materialCode } });
    if (codeTaken) {
      throw new AppError(`Material Code "${materialCode}" already exists. Choose it from the list instead of creating it again.`, 409);
    }

    const { material, lot } = await prisma.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: { materialCode, materialName, materialType, manufacturer, supplier, description, status: 'ACTIVE' },
      });
      const lot = await tx.materialLot.create({ data: { ...lotData(data), materialId: material.id } });
      return { material, lot };
    });

    await auditService.logAction('MATERIAL', 'CREATE', material.id, `Created material ${materialCode} while receiving lot ${lotCode}`, actingUserId);
    await auditService.logAction('MATERIAL_LOT', 'CREATE', lot.id, `Created lot ${lotCode}`, actingUserId);
    return lot;
  }

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) {
    throw new AppError(`Material with ID "${materialId}" not found.`, 404);
  }

  const lot = await prisma.materialLot.create({
    data: { ...lotData(data), materialId },
  });

  await auditService.logAction('MATERIAL_LOT', 'CREATE', lot.id, `Created lot ${lotCode}`, actingUserId);
  return lot;
};

const updateLot = async (id, data, actingUserId = null) => {
  const existingLot = await prisma.materialLot.findUnique({ where: { id } });
  if (!existingLot) {
    throw new AppError(`Lot with ID "${id}" not found.`, 404);
  }

  if (data.lotCode && data.lotCode !== existingLot.lotCode) {
    const existingCode = await prisma.materialLot.findUnique({ where: { lotCode: data.lotCode } });
    if (existingCode) {
      throw new AppError(`Lot Code "${data.lotCode}" is already in use.`, 409);
    }
  }

  if (data.materialId && data.materialId !== existingLot.materialId) {
    const material = await prisma.material.findUnique({ where: { id: data.materialId } });
    if (!material) throw new AppError(`Material with ID "${data.materialId}" not found.`, 404);
  }

  const updatedLot = await prisma.materialLot.update({
    where: { id },
    data: {
      lotCode: data.lotCode,
      materialId: data.materialId,
      quantity: data.quantity,
      unit: data.unit,
      receivedDate: data.receivedDate ? new Date(data.receivedDate) : undefined,
      status: data.status
    }
  });

  await auditService.logAction('MATERIAL_LOT', 'UPDATE', updatedLot.id, `Updated lot ${updatedLot.lotCode}`, actingUserId);
  return updatedLot;
};

const deleteLot = async (id, actingUserId = null) => {
  const existingLot = await prisma.materialLot.findUnique({ where: { id }, include: { mappings: true, dispatches: true, allocations: true } });
  if (!existingLot) {
    throw new AppError(`Lot with ID "${id}" not found.`, 404);
  }

  if (existingLot.mappings.length > 0 || existingLot.dispatches.length > 0) {
    throw new AppError(`Cannot delete Lot. It has active bay mappings or dispatches.`, 400);
  }

  if (existingLot.allocations.length > 0) {
    throw new AppError(`Cannot delete Lot. It has bay allocation history.`, 400);
  }

  await prisma.materialLot.delete({ where: { id } });
  await auditService.logAction('MATERIAL_LOT', 'DELETE', id, `Deleted lot ${existingLot.lotCode}`, actingUserId);
};

module.exports = {
  getAllLots,
  getLotById,
  createLot,
  updateLot,
  deleteLot
};
