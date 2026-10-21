const { Router } = require('express');
const materialController = require('../controllers/materialController');
const {
  validateMaterialId,
  validateCreateMaterial,
  validateUpdateMaterial,
} = require('../validators/materialValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// Authenticated for all; reads open to any role, writes require the
// material-management group (ADMIN, SUPERVISOR, OPERATOR).
router.use(authenticate);

router.get('/', materialController.getAllMaterials);
router.get('/:id', validateMaterialId, handleValidationErrors, materialController.getMaterialById);
router.post('/', authorize(GROUPS.MATERIAL_WRITE), validateCreateMaterial, handleValidationErrors, materialController.createMaterial);
router.put('/:id', authorize(GROUPS.MATERIAL_WRITE), validateUpdateMaterial, handleValidationErrors, materialController.updateMaterial);
router.delete('/:id', authorize(GROUPS.MATERIAL_WRITE), validateMaterialId, handleValidationErrors, materialController.deleteMaterial);

module.exports = router;
