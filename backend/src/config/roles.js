/**
 * Role definitions and authorization groups.
 *
 * Single source of truth for the four warehouse roles and the reusable role
 * groups consumed by the `authorize(...)` middleware. Centralising these here
 * (rather than scattering string literals through routes) means the access
 * matrix can be audited and changed in one place.
 *
 * Must stay in sync with the UserRole enum in schema.prisma.
 */

'use strict';

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  OPERATOR: 'OPERATOR',
  MANAGER: 'MANAGER',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

/**
 * Reusable authorization groups, derived directly from the access-control
 * matrix. Use these with authorize(...GROUP) in route definitions.
 */
const GROUPS = Object.freeze({
  // Any authenticated user may read shared, non-sensitive data.
  ANY: ALL_ROLES,

  // Master-data administration (bays).
  BAY_WRITE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // Material / lot master-data and QR generation.
  MATERIAL_WRITE: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Operational inventory transactions (mapping, move, remove, scan).
  OPERATIONS: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Bay allocation for incoming lots — allot / cancel (supervisory). Recording
  // arrival mode and confirming physical placement use OPERATIONS.
  ALLOCATION_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // Viewing FOIS / SAP rail consignments waiting to be received (OPERATIONS ∪
  // ALLOCATION_MANAGE). Importing one is ALLOCATION_MANAGE.
  INBOUND_VIEW: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Dispatch request creation.
  DISPATCH_CREATE: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Dispatch approval / rejection (supervisory).
  DISPATCH_APPROVE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // Gate validation / exit authorisation.
  GATE: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Audit log visibility.
  AUDIT_VIEW: [ROLES.ADMIN, ROLES.MANAGER],

  // User administration.
  USER_ADMIN: [ROLES.ADMIN],

  // Truck master & journey management (Phase 10).
  TRUCK_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // RFID reader registry management (Phase 10).
  RFID_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // RFID event ingestion — simulator today, hardware tomorrow (same pipeline).
  RFID_EVENT: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.OPERATOR],

  // Surveillance camera registry management (Phase 11).
  CAMERA_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // AI surveillance alerts — viewing the dashboard / alert feed (Phase 13).
  SURVEILLANCE_VIEW: ALL_ROLES,

  // AI surveillance management — acknowledge/resolve alerts, edit detector
  // (motion) configuration (Phase 13).
  SURVEILLANCE_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],

  // Employee face registry — register employees, enroll/delete faces (Phase 14).
  FACE_MANAGE: [ROLES.ADMIN, ROLES.SUPERVISOR],
});

module.exports = { ROLES, ALL_ROLES, GROUPS };
