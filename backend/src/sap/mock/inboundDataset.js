/**
 * Mock Inbound Consignments — MOCK / PLACEHOLDER DATA
 *
 * Stand-in for rail consignments recorded in FOIS (Indian Railways Freight
 * Operations Information System) or SAP. The real record shape and access
 * method are NOT known yet; these records are written directly in the
 * warehouse's own InboundConsignment contract (see src/inbound/consignment.js)
 * and must not be described as FOIS or SAP data.
 *
 * `meta` is free-form on purpose: rake / RR / wagon fields are illustrative
 * until the lead confirms which ones the source actually provides.
 *
 * Scenarios (deterministic, used by demos and tests):
 *   RR-2610-0451    normal rail consignment, material already catalogued
 *   RR-2610-0467    material not yet in the warehouse catalogue, no type given
 *   RR-2610-0398    already received — prisma/seed.js imports it
 *   IBD-5000012345  quantity / unit problem — import is rejected with 422
 */

'use strict';

const consignments = [
  {
    source: 'FOIS',
    externalRef: 'RR-2610-0451',
    materialCode: 'MAT-001',
    materialName: 'Steel Coil',
    materialType: 'RAW_MATERIAL',
    quantity: 58400,
    unit: 'KG',
    expectedOrArrivedAt: '2026-10-26T06:30:00.000Z',
    meta: { rakeNo: 'DEMO-RK-7731', rrNo: 'RR-2610-0451', wagonNos: ['DEMO-W-31452', 'DEMO-W-31453'] },
  },
  {
    source: 'FOIS',
    externalRef: 'RR-2610-0467',
    materialCode: 'MAT-901',
    materialName: 'Pig Iron',
    quantity: 42000,
    unit: 'KG',
    expectedOrArrivedAt: '2026-10-27T02:10:00.000Z',
    meta: { rakeNo: 'DEMO-RK-7740', rrNo: 'RR-2610-0467' },
  },
  {
    source: 'FOIS',
    externalRef: 'RR-2610-0398',
    materialCode: 'MAT-002',
    materialName: 'Copper Rod',
    materialType: 'RAW_MATERIAL',
    quantity: 12500,
    unit: 'KG',
    expectedOrArrivedAt: '2026-10-24T11:45:00.000Z',
    meta: { rakeNo: 'DEMO-RK-7702', rrNo: 'RR-2610-0398' },
  },
  {
    source: 'SAP',
    externalRef: 'IBD-5000012345',
    materialCode: 'MAT-003',
    materialName: 'Aluminium Sheet',
    materialType: 'RAW_MATERIAL',
    quantity: 0,
    unit: '',
    expectedOrArrivedAt: '2026-10-27T08:00:00.000Z',
    meta: { inboundDelivery: 'IBD-5000012345' },
  },
];

module.exports = { consignments };
