/**
 * RFID Infrastructure Service (Phase 10)
 *
 * Manages the RFID reader registry + health, and exposes the SINGLE event
 * ingestion pipeline used by both the simulator today and physical hardware
 * tomorrow:
 *
 *   RFID Reader / Simulator  →  POST /api/rfid/events  →  ingestEvent()
 *                            →  truckService.recordEvent()  (one rule engine)
 *
 * There is deliberately no second code path for "real" vs "simulated" events —
 * `source` is just a label on the same immutable event.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const { isValidStage } = require('../config/truckStages');
const truckService = require('./truckService');

const RFID_AUDIT = 'RFID';

// A reader is considered "live" if it heartbeated within this window.
const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

const isLive = (reader) =>
  reader.status === 'ONLINE' && reader.lastHeartbeat && (Date.now() - new Date(reader.lastHeartbeat).getTime()) < HEARTBEAT_STALE_MS;

// ─── Reader registry ──────────────────────────────────────────────────────────

const listReaders = async () => {
  const readers = await prisma.rFIDReader.findMany({ orderBy: [{ stage: 'asc' }, { readerCode: 'asc' }] });
  return readers.map((r) => ({ ...r, live: isLive(r) }));
};

const getReader = async (id) => {
  const reader = await prisma.rFIDReader.findUnique({ where: { id } });
  if (!reader) throw new AppError(`Reader "${id}" was not found.`, 404);
  return { ...reader, live: isLive(reader) };
};

const createReader = async (data, actingUserId = null) => {
  const { readerCode, readerName, readerType, stage, ipAddress, location, status } = data;
  if (!isValidStage(stage)) throw new AppError(`Unknown stage "${stage}".`, 400);
  const existing = await prisma.rFIDReader.findUnique({ where: { readerCode } });
  if (existing) throw new AppError(`Reader code "${readerCode}" already exists.`, 409);
  const reader = await prisma.rFIDReader.create({
    data: { readerCode, readerName, readerType: readerType || 'FIXED', stage, ipAddress, location, status: status || 'OFFLINE' },
  });
  await auditService.logAction(RFID_AUDIT, 'RFID_READER_CREATED', reader.id, `Created reader ${readerCode} @ ${stage}`, actingUserId);
  return reader;
};

const updateReader = async (id, data, actingUserId = null) => {
  const reader = await prisma.rFIDReader.findUnique({ where: { id } });
  if (!reader) throw new AppError(`Reader "${id}" was not found.`, 404);
  if (data.stage && !isValidStage(data.stage)) throw new AppError(`Unknown stage "${data.stage}".`, 400);
  if (data.readerCode && data.readerCode !== reader.readerCode) {
    const clash = await prisma.rFIDReader.findUnique({ where: { readerCode: data.readerCode } });
    if (clash) throw new AppError(`Reader code "${data.readerCode}" already exists.`, 409);
  }
  const updated = await prisma.rFIDReader.update({
    where: { id },
    data: {
      readerCode: data.readerCode ?? reader.readerCode,
      readerName: data.readerName ?? reader.readerName,
      readerType: data.readerType ?? reader.readerType,
      stage: data.stage ?? reader.stage,
      ipAddress: data.ipAddress === undefined ? reader.ipAddress : data.ipAddress,
      location: data.location === undefined ? reader.location : data.location,
      status: data.status ?? reader.status,
    },
  });
  await auditService.logAction(RFID_AUDIT, 'RFID_READER_UPDATED', id, `Updated reader ${updated.readerCode}`, actingUserId);
  return updated;
};

const deleteReader = async (id, actingUserId = null) => {
  const reader = await prisma.rFIDReader.findUnique({ where: { id } });
  if (!reader) throw new AppError(`Reader "${id}" was not found.`, 404);
  // Events keep their history (readerId is set null on delete by the FK rule).
  await prisma.rFIDReader.delete({ where: { id } });
  await auditService.logAction(RFID_AUDIT, 'RFID_READER_DELETED', id, `Deleted reader ${reader.readerCode}`, actingUserId);
};

/** Manual/keepalive heartbeat (also performed automatically on each scan). */
const heartbeat = async (id) => {
  const reader = await prisma.rFIDReader.findUnique({ where: { id } });
  if (!reader) throw new AppError(`Reader "${id}" was not found.`, 404);
  return prisma.rFIDReader.update({ where: { id }, data: { lastHeartbeat: new Date(), status: 'ONLINE' } });
};

const getReaderDashboard = async () => {
  const readers = (await prisma.rFIDReader.findMany({ orderBy: [{ stage: 'asc' }, { readerCode: 'asc' }] }))
    .map((r) => ({ ...r, live: isLive(r) }));
  const online = readers.filter((r) => r.live).length;
  const offline = readers.length - online;
  const maintenance = readers.filter((r) => r.status === 'MAINTENANCE').length;
  return { total: readers.length, online, offline, maintenance, readers };
};

// ─── Single event ingestion pipeline ──────────────────────────────────────────

/**
 * Resolve a scanned truck + reader and record the lifecycle event.
 * Hardware middleware and the UI simulator both call this with the same shape.
 *
 * @param {{ rfidTag?, truckId?, truckNumber?, readerCode?, readerId?, stage?, eventTime?, source? }} payload
 * @param {string|null} actingUserId
 */
const ingestEvent = async (payload, actingUserId = null) => {
  const { rfidTag, truckId, truckNumber, readerCode, readerId, stage, eventTime, source } = payload;

  // Resolve the reader (preferred — gives the stage) or accept an explicit stage.
  let reader = null;
  if (readerId) reader = await prisma.rFIDReader.findUnique({ where: { id: readerId } });
  else if (readerCode) reader = await prisma.rFIDReader.findUnique({ where: { readerCode } });
  if ((readerId || readerCode) && !reader) throw new AppError('The scanning reader was not found in the registry.', 404);

  const resolvedStage = reader ? reader.stage : stage;
  if (!resolvedStage) throw new AppError('A reader (with a stage) or an explicit stage is required.', 400);

  // Resolve the truck by tag, id, or number.
  let truck = null;
  if (rfidTag) truck = await prisma.truck.findUnique({ where: { rfidTag } });
  else if (truckId) truck = await prisma.truck.findUnique({ where: { id: truckId } });
  else if (truckNumber) truck = await prisma.truck.findUnique({ where: { truckNumber } });
  if (!truck) throw new AppError('No truck matched the scanned tag/identifier.', 404);
  if (truck.status !== 'ACTIVE') throw new AppError(`Truck ${truck.truckNumber} is inactive.`, 409);

  const result = await truckService.recordEvent({
    truck,
    stage: resolvedStage,
    readerId: reader ? reader.id : null,
    source: source || (reader ? 'RFID' : 'MANUAL'),
    rawTag: rfidTag || truck.rfidTag || null,
    eventTime,
    actingUserId,
  });

  return {
    truck: { id: truck.id, truckNumber: truck.truckNumber },
    reader: reader ? { id: reader.id, readerCode: reader.readerCode, stage: reader.stage } : null,
    stage: resolvedStage,
    visit: result.visit,
    event: result.event,
    alerts: result.alerts,
  };
};

module.exports = {
  listReaders,
  getReader,
  createReader,
  updateReader,
  deleteReader,
  heartbeat,
  getReaderDashboard,
  ingestEvent,
};
