const { Router } = require('express');
const lotController = require('../controllers/lotController');
const {
  validateLotId,
  validateCreateLot,
  validateUpdateLot,
} = require('../validators/lotValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// Authenticated for all; reads open to any role, writes require the
// material-management group (ADMIN, SUPERVISOR, OPERATOR).
router.use(authenticate);

router.get('/', lotController.getAllLots);
router.get('/:id', validateLotId, handleValidationErrors, lotController.getLotById);
router.post('/', authorize(GROUPS.MATERIAL_WRITE), validateCreateLot, handleValidationErrors, lotController.createLot);
router.put('/:id', authorize(GROUPS.MATERIAL_WRITE), validateUpdateLot, handleValidationErrors, lotController.updateLot);
router.delete('/:id', authorize(GROUPS.MATERIAL_WRITE), validateLotId, handleValidationErrors, lotController.deleteLot);

module.exports = router;
