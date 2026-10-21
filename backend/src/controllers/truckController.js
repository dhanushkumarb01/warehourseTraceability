/**
 * Truck Controller (Phase 10) — HTTP layer only.
 * Express 5 auto-propagates async rejections to the global error handler.
 */

'use strict';

const truckService = require('../services/truckService');
const { sendSuccess } = require('../utils/responseHelper');

const getDashboard = async (req, res) => {
  const data = await truckService.getDashboard();
  sendSuccess(res, 200, 'Truck dashboard retrieved.', data);
};

const listVisits = async (req, res) => {
  const visits = await truckService.listVisits({
    status: req.query.status, risk: req.query.risk, truckId: req.query.truckId, limit: req.query.limit,
  });
  sendSuccess(res, 200, 'Truck visits retrieved.', visits);
};

const getJourney = async (req, res) => {
  const journey = await truckService.getJourney(req.params.id);
  sendSuccess(res, 200, 'Truck journey retrieved.', journey);
};

const listTrucks = async (req, res) => {
  const trucks = await truckService.listTrucks();
  sendSuccess(res, 200, 'Trucks retrieved.', trucks);
};

const getTruck = async (req, res) => {
  const truck = await truckService.getTruck(req.params.id);
  sendSuccess(res, 200, 'Truck retrieved.', truck);
};

const createTruck = async (req, res) => {
  const truck = await truckService.createTruck(req.body, req.user.id);
  sendSuccess(res, 201, 'Truck created.', truck);
};

const updateTruck = async (req, res) => {
  const truck = await truckService.updateTruck(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Truck updated.', truck);
};

module.exports = { getDashboard, listVisits, getJourney, listTrucks, getTruck, createTruck, updateTruck };
