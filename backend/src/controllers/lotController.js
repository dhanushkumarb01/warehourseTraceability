const lotService = require('../services/lotService');
const { sendSuccess } = require('../utils/responseHelper');

const getAllLots = async (req, res, next) => {
  const lots = await lotService.getAllLots();
  sendSuccess(res, 200, 'Lots retrieved successfully.', lots);
};

const getLotById = async (req, res, next) => {
  const lot = await lotService.getLotById(req.params.id);
  sendSuccess(res, 200, 'Lot retrieved successfully.', lot);
};

const createLot = async (req, res, next) => {
  const lot = await lotService.createLot(req.body, req.user.id);
  sendSuccess(res, 201, 'Lot created successfully.', lot);
};

const updateLot = async (req, res, next) => {
  const lot = await lotService.updateLot(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Lot updated successfully.', lot);
};

const deleteLot = async (req, res, next) => {
  await lotService.deleteLot(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Lot deleted successfully.');
};

module.exports = {
  getAllLots,
  getLotById,
  createLot,
  updateLot,
  deleteLot
};
