const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');

const getAllMaterials = async () => {
  return prisma.material.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { lots: true }
      }
    }
  });
};

const getMaterialById = async (id) => {
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      lots: {
        orderBy: { receivedDate: 'desc' }
      }
    }
  });

  if (!material) {
    throw new AppError(`Material with ID "${id}" not found.`, 404);
  }

  return material;
};

const createMaterial = async (data, actingUserId = null) => {
  const { materialCode, materialName, materialType, manufacturer, supplier, description, status } = data;

  const existing = await prisma.material.findUnique({ where: { materialCode } });
  if (existing) {
    throw new AppError(`Material Code "${materialCode}" is already in use.`, 409);
  }

  const material = await prisma.material.create({
    data: {
      materialCode,
      materialName,
      materialType,
      manufacturer,
      supplier,
      description,
      status: status || 'ACTIVE'
    }
  });

  await auditService.logAction('MATERIAL', 'CREATE', material.id, `Created material ${materialCode}`, actingUserId);
  return material;
};

const updateMaterial = async (id, data, actingUserId = null) => {
  const existingMaterial = await prisma.material.findUnique({ where: { id } });
  if (!existingMaterial) {
    throw new AppError(`Material with ID "${id}" not found.`, 404);
  }

  if (data.materialCode && data.materialCode !== existingMaterial.materialCode) {
    const existingCode = await prisma.material.findUnique({ where: { materialCode: data.materialCode } });
    if (existingCode) {
      throw new AppError(`Material Code "${data.materialCode}" is already in use.`, 409);
    }
  }

  const updatedMaterial = await prisma.material.update({
    where: { id },
    data: {
      materialCode: data.materialCode,
      materialName: data.materialName,
      materialType: data.materialType,
      manufacturer: data.manufacturer,
      supplier: data.supplier,
      description: data.description,
      status: data.status
    }
  });

  await auditService.logAction('MATERIAL', 'UPDATE', updatedMaterial.id, `Updated material ${updatedMaterial.materialCode}`, actingUserId);
  return updatedMaterial;
};

const deleteMaterial = async (id, actingUserId = null) => {
  const existingMaterial = await prisma.material.findUnique({ where: { id }, include: { lots: true } });
  if (!existingMaterial) {
    throw new AppError(`Material with ID "${id}" not found.`, 404);
  }

  if (existingMaterial.lots.length > 0) {
    throw new AppError(`Cannot delete Material. There are ${existingMaterial.lots.length} lots associated with it.`, 400);
  }

  await prisma.material.delete({ where: { id } });
  await auditService.logAction('MATERIAL', 'DELETE', id, `Deleted material ${existingMaterial.materialCode}`, actingUserId);
};

module.exports = {
  getAllMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial
};
