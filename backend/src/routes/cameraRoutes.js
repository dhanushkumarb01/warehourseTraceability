/**
 * Camera Routes — mounted at /api/cameras  (authenticated)
 *
 *   GET    /api/cameras                 List (search/filter/sort/paginate)  [ANY]
 *   GET    /api/cameras/summary         Status/health counts                [ANY]
 *   POST   /api/cameras/test            Test ad-hoc connection details      [ADMIN, SUPERVISOR]
 *   POST   /api/cameras                 Register a camera                   [ADMIN, SUPERVISOR]
 *   GET    /api/cameras/:id             Single camera                       [ANY]
 *   PUT    /api/cameras/:id             Update camera                       [ADMIN, SUPERVISOR]
 *   DELETE /api/cameras/:id             Delete camera                       [ADMIN, SUPERVISOR]
 *   POST   /api/cameras/:id/test        Test a saved camera's connection    [ADMIN, SUPERVISOR]
 *
 * Reads are open to any authenticated role; all writes + connection tests
 * require the surveillance-management group. Passwords are never returned.
 */

'use strict';

const { Router } = require('express');
const cameraController = require('../controllers/cameraController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');
const {
  validateCreateCamera, validateUpdateCamera, validateCameraId, validateTestAdhoc, validateListQuery,
} = require('../validators/cameraValidators');
const handleValidationErrors = require('../middleware/validate');

const router = Router();
router.use(authenticate);

// Literal paths before '/:id'
router.get('/summary', cameraController.summary);
router.post('/test', authorize(GROUPS.CAMERA_MANAGE), validateTestAdhoc, handleValidationErrors, cameraController.testAdhoc);

router.get('/', validateListQuery, handleValidationErrors, cameraController.list);
router.post('/', authorize(GROUPS.CAMERA_MANAGE), validateCreateCamera, handleValidationErrors, cameraController.create);

router.get('/:id', validateCameraId, handleValidationErrors, cameraController.getById);
router.put('/:id', authorize(GROUPS.CAMERA_MANAGE), validateUpdateCamera, handleValidationErrors, cameraController.update);
router.delete('/:id', authorize(GROUPS.CAMERA_MANAGE), validateCameraId, handleValidationErrors, cameraController.remove);
router.post('/:id/test', authorize(GROUPS.CAMERA_MANAGE), validateCameraId, handleValidationErrors, cameraController.testById);

module.exports = router;
