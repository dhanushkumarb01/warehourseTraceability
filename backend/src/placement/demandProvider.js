/**
 * Demand provider — the seam where the real demand model will plug in.
 *
 * Contract (keep it when replacing this module):
 *
 *   getDemand({ lot, material, override? }) → {
 *     level:  'HIGH' | 'MEDIUM' | 'LOW',
 *     source: string,          // where the level came from
 *     isPlaceholder: boolean,  // true until real analytics back it
 *     explanation: string,     // one sentence shown to the supervisor
 *   }
 *
 * The current implementation is a static lookup in config/placement.js. It does
 * not read dispatch history and must not be described as demand analytics.
 */

'use strict';

const { placementConfig, normaliseLevel } = require('../config/placement');

const PROVIDER_ID = 'STATIC_CONFIG';

/**
 * Build a static demand provider over a mock-demand config.
 * @param {{ defaultLevel: string, byMaterialType: object, byMaterialCode: object }} mockDemand
 */
const createStaticDemandProvider = (mockDemand = placementConfig.mockDemand) => ({
  id: PROVIDER_ID,

  getDemand({ material, override } = {}) {
    const overrideLevel = normaliseLevel(override);
    if (overrideLevel) {
      return {
        level: overrideLevel,
        source: 'MANUAL_OVERRIDE',
        isPlaceholder: true,
        explanation: 'Demand level chosen by the supervisor for this recommendation.',
      };
    }

    const code = material?.materialCode?.trim().toLowerCase();
    const type = material?.materialType?.trim().toLowerCase();

    if (code && mockDemand.byMaterialCode[code]) {
      return {
        level: mockDemand.byMaterialCode[code],
        source: PROVIDER_ID,
        isPlaceholder: true,
        explanation: `Static placeholder value configured for material ${material.materialCode}.`,
      };
    }
    if (type && mockDemand.byMaterialType[type]) {
      return {
        level: mockDemand.byMaterialType[type],
        source: PROVIDER_ID,
        isPlaceholder: true,
        explanation: `Static placeholder value configured for material type "${material.materialType}".`,
      };
    }
    return {
      level: mockDemand.defaultLevel,
      source: PROVIDER_ID,
      isPlaceholder: true,
      explanation: 'Default static placeholder value — no demand data is used yet.',
    };
  },
});

module.exports = { createStaticDemandProvider, PROVIDER_ID };
