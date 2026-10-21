/**
 * RFID Routes — mounted at /api/rfid  (authenticated)
 *
 *   POST   /api/rfid/events                  Ingest a lifecycle event   [ADMIN, SUPERVISOR, OPERATOR]
 *   GET    /api/rfid/readers/dashboard       Reader health              [ANY]
 *   GET    /api/rfid/readers                 Reader registry            [ANY]
 *   POST   /api/rfid/readers                 Create reader              [ADMIN, SUPERVISOR]
 *   GET    /api/rfid/readers/:id             Single reader              [ANY]
 *   PUT    /api/rfid/readers/:id             Update reader              [ADMIN, SUPERVISOR]
 *   DELETE /api/rfid/readers/:id             Delete reader              [ADMIN, SUPERVISOR]
 *   POST   /api/rfid/readers/:id/heartbeat   Keepalive                  [ADMIN, SUPERVISOR, OPERATOR]
 *
 * `POST /events` is the SINGLE pipeline shared by the simulator and real
 * hardware — future RFID middleware calls this exact endpoint.
 */

'use strict';

const { Router } = require('express');
const rfidController = require('../controllers/rfidController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');
const {
  validateCreateReader, validateUpdateReader, validateReaderId, validateIngestEvent,
} = require('../validators/rfidValidators');
const handleValidationErrors = require('../middleware/validate');

const router = Router();
router.use(authenticate);

// Event pipeline
router.post('/events', authorize(GROUPS.RFID_EVENT), validateIngestEvent, handleValidationErrors, rfidController.ingestEvent);

// Reader registry — literal paths before '/:id'
router.get('/readers/dashboard', rfidController.getReaderDashboard);
router.get('/readers', rfidController.listReaders);
router.post('/readers', authorize(GROUPS.RFID_MANAGE), validateCreateReader, handleValidationErrors, rfidController.createReader);
router.get('/readers/:id', validateReaderId, handleValidationErrors, rfidController.getReader);
router.put('/readers/:id', authorize(GROUPS.RFID_MANAGE), validateUpdateReader, handleValidationErrors, rfidController.updateReader);
router.delete('/readers/:id', authorize(GROUPS.RFID_MANAGE), validateReaderId, handleValidationErrors, rfidController.deleteReader);
router.post('/readers/:id/heartbeat', authorize(GROUPS.RFID_EVENT), validateReaderId, handleValidationErrors, rfidController.heartbeat);

module.exports = router;
