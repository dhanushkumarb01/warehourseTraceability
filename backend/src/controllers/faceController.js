/**
 * Face Registry Controller (Phase 14) — HTTP layer only, no business logic.
 *
 * Employee registration + face enrollment/management for the Face Detection /
 * Unknown Person use case. Only embeddings are stored; images are never kept.
 */

'use strict';

const faceService = require('../services/faceService');
const { sendSuccess } = require('../utils/responseHelper');

const listEmployees = async (req, res) => {
  const data = await faceService.listEmployees(req.query);
  sendSuccess(res, 200, 'Employees retrieved.', data);
};

const summary = async (req, res) => {
  const data = await faceService.getSummary();
  sendSuccess(res, 200, 'Face registry summary retrieved.', data);
};

const getEmployee = async (req, res) => {
  const data = await faceService.getEmployee(req.params.id);
  sendSuccess(res, 200, 'Employee retrieved.', data);
};

const createEmployee = async (req, res) => {
  const data = await faceService.createEmployee(req.body, req.user.id);
  sendSuccess(res, 201, 'Employee registered.', data);
};

const updateEmployee = async (req, res) => {
  const data = await faceService.updateEmployee(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Employee updated.', data);
};

const deleteEmployee = async (req, res) => {
  const data = await faceService.deleteEmployee(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Employee deleted.', data);
};

const listFaces = async (req, res) => {
  const data = await faceService.listFaces(req.params.id);
  sendSuccess(res, 200, 'Enrolled faces retrieved.', data);
};

const addFace = async (req, res) => {
  const data = await faceService.addFace(req.params.id, req.body.imageBase64, req.user.id);
  sendSuccess(res, 201, 'Face enrolled.', data);
};

const deleteFace = async (req, res) => {
  const data = await faceService.deleteFace(req.params.id, req.params.faceId, req.user.id);
  sendSuccess(res, 200, 'Face removed.', data);
};

module.exports = {
  listEmployees, summary, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  listFaces, addFace, deleteFace,
};
