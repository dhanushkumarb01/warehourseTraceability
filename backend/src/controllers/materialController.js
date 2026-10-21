const materialService = require('../services/materialService');
const { sendSuccess } = require('../utils/responseHelper');

const getAllMaterials = async (req, res, next) => {
  const materials = await materialService.getAllMaterials();
  sendSuccess(res, 200, 'Materials retrieved successfully.', materials);
};

const getMaterialById = async (req, res, next) => {
  const material = await materialService.getMaterialById(req.params.id);
  sendSuccess(res, 200, 'Material retrieved successfully.', material);
};

const createMaterial = async (req, res, next) => {
  const material = await materialService.createMaterial(req.body, req.user.id);
  sendSuccess(res, 201, 'Material created successfully.', material);
};

const updateMaterial = async (req, res, next) => {
  const material = await materialService.updateMaterial(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Material updated successfully.', material);
};

const deleteMaterial = async (req, res, next) => {
  await materialService.deleteMaterial(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Material deleted successfully.');
};

module.exports = {
  getAllMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial
};
