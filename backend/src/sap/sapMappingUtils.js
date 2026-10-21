/**
 * SAP Mapping Utilities
 *
 * Pure translation between warehouse entities and SAP payloads. Keeping field
 * mapping in one place means that if SAP's field names differ from the mock,
 * only this file changes — connectors and services stay put.
 *
 * Current convention: the warehouse `materialCode` maps to SAP `materialNumber`
 * and `lotCode` maps to SAP `batchNumber`. Adjust here to match the client's
 * real SAP field names at go-live.
 */

'use strict';

/** Warehouse material → SAP material number. */
const toSapMaterialNumber = (material) => material?.materialCode || null;

/** Warehouse lot → SAP batch number. */
const toSapBatchNumber = (lot) => lot?.lotCode || null;

/**
 * Build the payload used to validate a dispatch against SAP.
 * @param {object} dispatch  warehouse dispatch (with bay)
 * @param {object} lot       warehouse lot (with material)
 * @param {number} [quantity]
 */
const toSapDispatchValidationPayload = (dispatch, lot, quantity) => ({
  deliveryNumber: dispatch?.sapDeliveryNumber || null,
  materialNumber: toSapMaterialNumber(lot?.material),
  batchNumber: toSapBatchNumber(lot),
  quantity: quantity ?? dispatch?.approvedQuantity ?? dispatch?.requestedQuantity ?? lot?.quantity,
});

/** Build the payload to push a warehouse dispatch into SAP (outbound delivery). */
const toSapDeliveryPayload = (dispatch, lot) => ({
  warehouseDispatchNumber: dispatch?.dispatchNumber,
  materialNumber: toSapMaterialNumber(lot?.material),
  batchNumber: toSapBatchNumber(lot),
  quantity: dispatch?.approvedQuantity ?? dispatch?.requestedQuantity,
  unit: lot?.unit || 'KG',
});

/** Normalise a warehouse material into the SAP material upsert payload. */
const toSapMaterialPayload = (material) => ({
  materialNumber: material?.materialCode,
  description: material?.materialName,
  materialType: material?.materialType,
});

module.exports = {
  toSapMaterialNumber,
  toSapBatchNumber,
  toSapDispatchValidationPayload,
  toSapDeliveryPayload,
  toSapMaterialPayload,
};
