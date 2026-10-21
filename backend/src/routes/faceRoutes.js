/**
 * Face Registry Routes — mounted at /api/faces  (Phase 14)
 *
 * Employee registration + face enrollment/management for the Face Detection /
 * Unknown Person use case. Viewing is open to any authenticated user; all
 * mutations require the FACE_MANAGE group. Only embeddings are stored — the
 * enrolled images are sent to the AI worker for embedding and never persisted.
 *
 *   GET    /                       List employees (search/paginate)     [ANY]
 *   GET    /summary                Registry counts                      [ANY]
 *   GET    /:id                    Employee + enrolled-face metadata     [ANY]
 *   POST   /                       Register an employee                  [FACE_MANAGE]
 *   PUT    /:id                    Update an employee                    [FACE_MANAGE]
 *   DELETE /:id                    Delete employee (+ all faces)         [FACE_MANAGE]
 *   GET    /:id/faces              List an employee's enrolled faces      [ANY]
 *   POST   /:id/faces              Enroll a face (image → embedding)     [FACE_MANAGE]
 *   DELETE /:id/faces/:faceId      Remove an enrolled face               [FACE_MANAGE]
 */

'use strict';

const express = require('express');
const { Router } = express;
const faceController = require('../controllers/faceController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const handleValidationErrors = require('../middleware/validate');
const { GROUPS } = require('../config/roles');
const {
  validateEmployeeId, validateListQuery, validateCreateEmployee,
  validateUpdateEmployee, validateAddFace, validateDeleteFace,
} = require('../validators/faceValidators');

const router = Router();

// Face-enrollment carries a base64 image → dedicated larger JSON parser.
const faceImageParser = express.json({ limit: '8mb' });

router.use(authenticate);

router.get('/', validateListQuery, handleValidationErrors, faceController.listEmployees);
router.get('/summary', faceController.summary);
router.get('/:id', validateEmployeeId, handleValidationErrors, faceController.getEmployee);
router.post('/', authorize(GROUPS.FACE_MANAGE), validateCreateEmployee, handleValidationErrors, faceController.createEmployee);
router.put('/:id', authorize(GROUPS.FACE_MANAGE), validateUpdateEmployee, handleValidationErrors, faceController.updateEmployee);
router.delete('/:id', authorize(GROUPS.FACE_MANAGE), validateEmployeeId, handleValidationErrors, faceController.deleteEmployee);

router.get('/:id/faces', validateEmployeeId, handleValidationErrors, faceController.listFaces);
router.post('/:id/faces', authorize(GROUPS.FACE_MANAGE), faceImageParser, validateAddFace, handleValidationErrors, faceController.addFace);
router.delete('/:id/faces/:faceId', authorize(GROUPS.FACE_MANAGE), validateDeleteFace, handleValidationErrors, faceController.deleteFace);

module.exports = router;
