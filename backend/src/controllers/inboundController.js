/**
 * Inbound Controller — HTTP layer for FOIS / SAP rail consignments.
 * Attribution always comes from the authenticated user.
 */

'use strict';

const inboundService = require('../services/inboundService');
const { sendSuccess } = require('../utils/responseHelper');

/** GET /api/inbound/pending */
const listPending = async (req, res) => {
  const { source, search } = req.query;
  const result = await inboundService.listPending({ source, search });
  sendSuccess(res, 200, 'Pending consignments retrieved successfully.', result);
};

/** POST /api/inbound/import */
const importConsignment = async (req, res) => {
  const { source, externalRef } = req.body;
  const result = await inboundService.importConsignment({ source, externalRef, userId: req.user.id });
  sendSuccess(res, 201, `Received as lot ${result.lot.lotCode}.`, result);
};

module.exports = { listPending, importConsignment };
