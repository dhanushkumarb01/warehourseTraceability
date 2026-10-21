/**
 * Camera Controller (Phase 11) — HTTP layer only.
 */

'use strict';

const cameraService = require('../services/cameraService');
const { sendSuccess } = require('../utils/responseHelper');

const list = async (req, res) => {
  const data = await cameraService.listCameras(req.query);
  sendSuccess(res, 200, 'Cameras retrieved.', data);
};

const summary = async (req, res) => {
  const data = await cameraService.getSummary();
  sendSuccess(res, 200, 'Camera summary retrieved.', data);
};

const getById = async (req, res) => {
  const cam = await cameraService.getCamera(req.params.id);
  sendSuccess(res, 200, 'Camera retrieved.', cam);
};

const create = async (req, res) => {
  const cam = await cameraService.createCamera(req.body, req.user.id);
  sendSuccess(res, 201, 'Camera registered.', cam);
};

const update = async (req, res) => {
  const cam = await cameraService.updateCamera(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Camera updated.', cam);
};

const remove = async (req, res) => {
  await cameraService.deleteCamera(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Camera deleted.');
};

/** Test a saved camera's connection. */
const testById = async (req, res) => {
  const result = await cameraService.testConnection({ id: req.params.id }, req.user.id);
  sendSuccess(res, 200, 'Connection test completed.', result);
};

/** Test ad-hoc connection details from the registration form (before saving). */
const testAdhoc = async (req, res) => {
  const { streamType, streamUrl, username, password } = req.body;
  const result = await cameraService.testConnection({ streamType, streamUrl, username, password }, req.user.id);
  sendSuccess(res, 200, 'Connection test completed.', result);
};

module.exports = { list, summary, getById, create, update, remove, testById, testAdhoc };
