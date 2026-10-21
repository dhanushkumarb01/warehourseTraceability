/**
 * SAP Validation Service  (Integration Layer)
 *
 * The ONLY bridge between warehouse operations and SAP validation. Dispatch and
 * gate services call this — never a connector directly — preserving the
 * decoupling: Warehouse → Integration Layer → Connector → SAP.
 *
 * Every validation:
 *   - runs the relevant SAP checks through the active connector (with retry),
 *   - returns a structured, UI-friendly result (decision + granular checks),
 *   - persists a SAPValidationLog and an audit entry.
 *
 * Fail-safe philosophy: a genuine SAP *check failure* (material blocked,
 * inventory short, delivery rejected) BLOCKS the operation. SAP being
 * *unreachable* yields a WARNING that allows the operation to proceed (so an
 * ERP outage never halts the warehouse) — unless SAP_BLOCK_ON_UNAVAILABLE is
 * set, in which case unavailability blocks too.
 */

'use strict';

const env = require('../config/env');
const { getConnector, getMode } = require('./connectors');
const { withRetry } = require('./sapRetryHandler');
const mappingUtils = require('./sapMappingUtils');
const sapLogService = require('./sapLogService');
const auditService = require('../services/auditService');

const DECISION = { VALIDATED: 'VALIDATED', WARNING: 'WARNING', BLOCKED: 'BLOCKED' };

const check = (key, label, status, detail) => ({ key, label, status, detail }); // status: PASS|WARN|FAIL

/** Build the fail-safe result used when SAP cannot be reached. */
const unavailableResult = (validationType, label) => {
  const blocked = env.SAP_BLOCK_ON_UNAVAILABLE;
  return {
    decision: blocked ? DECISION.BLOCKED : DECISION.WARNING,
    recommendation: blocked ? 'BLOCK' : 'REVIEW',
    unavailable: true,
    reasons: [`SAP is currently unreachable; ${blocked ? 'operation blocked' : 'proceeding with a warning'} (fail-${blocked ? 'closed' : 'open'}).`],
    checks: [check('connectivity', `${label} — SAP connectivity`, blocked ? 'FAIL' : 'WARN', 'SAP gateway did not respond after retries.')],
    validatedAt: new Date().toISOString(),
  };
};

/** Persist a validation log + audit entry (best-effort). */
const record = async ({ validationType, entityId, result, actingUserId, blockedAction }) => {
  await sapLogService.createValidationLog({
    entityType: validationType,
    entityId,
    validationType,
    status: result.decision,
    message: result.reasons.join(' | ') || 'All SAP checks passed.',
    details: { checks: result.checks, unavailable: result.unavailable, mode: getMode() },
  });

  const action =
    result.decision === DECISION.BLOCKED ? 'SAP_VALIDATION_FAILED'
    : result.decision === DECISION.WARNING ? 'SAP_VALIDATION_WARNING'
    : 'SAP_VALIDATION_PASSED';

  await auditService.logAction('SAP', action, entityId, JSON.stringify({ validationType, reasons: result.reasons, mode: getMode() }), actingUserId);

  if (result.decision === DECISION.BLOCKED && blockedAction) {
    await auditService.logAction('SAP', blockedAction, entityId, JSON.stringify({ reasons: result.reasons }), actingUserId);
  }
};

/** Shared check runner for dispatch-style validations. */
const runDispatchChecks = async (connector, { materialNumber, batchNumber, quantity, deliveryNumber }, labels) => {
  const checks = [];
  const reasons = [];

  // Material existence + status
  const matRes = await connector.validateMaterial({ materialNumber });
  if (matRes.material) {
    checks.push(check('material', labels.material, matRes.valid ? 'PASS' : 'FAIL', `SAP status: ${matRes.status}${matRes.material.synthetic ? ' (auto-resolved)' : ''}`));
  }
  if (!matRes.valid) reasons.push(...matRes.reasons);

  // Inventory match
  if (quantity != null) {
    const invRes = await connector.validateInventory({ materialNumber, quantity });
    checks.push(check('inventory', labels.inventory, invRes.valid ? 'PASS' : 'FAIL', `SAP unrestricted: ${invRes.available}`));
    if (!invRes.valid) reasons.push(...invRes.reasons);
  }

  // Aggregate dispatch/delivery eligibility (batch + delivery status)
  const dispRes = await connector.validateDispatch({ materialNumber, batchNumber, quantity, deliveryNumber });
  checks.push(check('eligibility', labels.eligibility, dispRes.valid ? 'PASS' : 'FAIL', dispRes.deliveryStatus ? `Delivery: ${dispRes.deliveryStatus}` : 'Eligibility evaluated'));
  for (const r of dispRes.reasons) if (!reasons.includes(r)) reasons.push(r);

  return { checks, reasons };
};

/** Map a checks/reasons outcome to a decision result. */
const decide = (checks, reasons) => {
  const fail = checks.some((c) => c.status === 'FAIL') || reasons.length > 0;
  return {
    decision: fail ? DECISION.BLOCKED : DECISION.VALIDATED,
    recommendation: fail ? 'BLOCK' : 'APPROVE',
    unavailable: false,
    reasons,
    checks,
    validatedAt: new Date().toISOString(),
  };
};

// ─── Public: Dispatch approval validation ─────────────────────────────────────
/**
 * @param {{ dispatch: object, lot: object, requestedQuantity?: number, actingUserId?: string, persist?: boolean }} input
 */
const validateDispatchApproval = async ({ dispatch, lot, requestedQuantity = null, actingUserId = null, persist = true }) => {
  const connector = getConnector();
  const payload = mappingUtils.toSapDispatchValidationPayload(dispatch, lot, requestedQuantity);
  const labels = {
    material: 'Material status (SAP)',
    inventory: 'Inventory match (SAP)',
    eligibility: 'Dispatch eligibility (SAP)',
  };

  await auditService.logAction('SAP', 'SAP_VALIDATION_REQUESTED', dispatch.id, JSON.stringify({ validationType: 'DISPATCH_APPROVAL', payload }), actingUserId);

  let result;
  try {
    const { checks, reasons } = (await withRetry(() => runDispatchChecks(connector, payload, labels))).result;
    result = decide(checks, reasons);
  } catch (err) {
    result = unavailableResult('DISPATCH_APPROVAL', 'Dispatch');
  }

  if (persist) {
    await record({ validationType: 'DISPATCH_APPROVAL', entityId: dispatch.id, result, actingUserId, blockedAction: 'DISPATCH_BLOCKED_BY_SAP' });
  }
  return result;
};

// ─── Public: Gate exit validation ─────────────────────────────────────────────
/**
 * @param {{ dispatch: object, lot: object, actingUserId?: string, persist?: boolean }} input
 */
const validateGateExit = async ({ dispatch, lot, actingUserId = null, persist = true }) => {
  const connector = getConnector();
  const payload = mappingUtils.toSapDispatchValidationPayload(dispatch, lot, dispatch?.approvedQuantity ?? dispatch?.requestedQuantity);
  const labels = {
    material: 'Material/Lot status (SAP)',
    inventory: 'Inventory match (SAP)',
    eligibility: 'Dispatch eligibility (SAP)',
  };

  await auditService.logAction('SAP', 'SAP_VALIDATION_REQUESTED', dispatch.id, JSON.stringify({ validationType: 'GATE_EXIT', payload }), actingUserId);

  let result;
  try {
    const { checks, reasons } = (await withRetry(() => runDispatchChecks(connector, payload, labels))).result;
    result = decide(checks, reasons);
  } catch (err) {
    result = unavailableResult('GATE_EXIT', 'Gate exit');
  }

  if (persist) {
    await record({ validationType: 'GATE_EXIT', entityId: dispatch.id, result, actingUserId, blockedAction: 'GATE_EXIT_BLOCKED_BY_SAP' });
  }
  return result;
};

module.exports = {
  DECISION,
  validateDispatchApproval,
  validateGateExit,
};
