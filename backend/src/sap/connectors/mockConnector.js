/**
 * Mock SAP Connector
 *
 * Implements the connector interface in-process by delegating to the mock SAP
 * service. Fast and deterministic — ideal for development and tests. Swappable
 * with httpConnector via the factory (config switch only).
 */

'use strict';

const sap = require('../mock/sapMockService');

module.exports = {
  mode: 'mock',
  ping: () => sap.ping(),
  getMaterial: (materialNumber) => sap.getMaterial(materialNumber),
  listMaterials: () => sap.listMaterials(),
  getLot: (batchNumber, materialNumber) => sap.getBatch(batchNumber, materialNumber),
  listLots: () => sap.listBatches(),
  getInventory: (materialNumber) => sap.getInventory(materialNumber),
  listInventory: () => sap.listInventory(),
  getDispatch: (deliveryNumber) => sap.getDelivery(deliveryNumber),
  listDispatches: () => sap.listDeliveries(),
  createDispatch: (payload) => sap.createDelivery(payload),
  validateMaterial: (payload) => sap.validateMaterial(payload),
  validateInventory: (payload) => sap.validateInventory(payload),
  validateDispatch: (payload) => sap.validateDispatch(payload),
  // Inbound rail consignments — MOCK / PLACEHOLDER dataset (sap/mock/inboundDataset.js).
  getInboundConsignments: (filters) => sap.listInboundConsignments(filters),
  getInboundConsignment: (source, externalRef) => sap.getInboundConsignment(source, externalRef),
};
