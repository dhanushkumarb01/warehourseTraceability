/**
 * SAP Connector Factory
 *
 * Returns the active connector based on SAP_MODE. This is the ONLY place that
 * decides mock vs real — every integration service depends on this factory, so
 * go-live is a single configuration switch.
 */

'use strict';

const env = require('../../config/env');
const mockConnector = require('./mockConnector');
const httpConnector = require('./httpConnector');

const getConnector = () => (env.SAP_MODE === 'http' ? httpConnector : mockConnector);

const getMode = () => (env.SAP_MODE === 'http' ? 'http' : 'mock');

module.exports = { getConnector, getMode };
