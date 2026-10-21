/**
 * Truck Traceability Service (Phase 10)
 *
 * Owns the truck master, the visit (journey) lifecycle, the dashboard, and the
 * RFID event rule engine. Controllers never touch Prisma directly.
 *
 * The rule engine (recordEvent) is the heart of the module and the single place
 * the lifecycle business rules live:
 *   - Rule 1/2: after INVOICE only PARKING or EXIT_GATE are valid; INVOICE →
 *     LOADING_DOCK raises UNAUTHORIZED_REENTRY (the exact problem being solved).
 *   - Rule 3: excessive dwell in a stage raises a DELAY alert.
 *   - Rule 4: a backwards/invalid stage order raises SEQUENCE_VIOLATION.
 *   - Rule 5: every violation is persisted as a TruckAlert AND written to the
 *     audit log, and surfaced on the dashboard + journey.
 *
 * Events are append-only — history is never overwritten. The visit is linked to
 * an existing Dispatch (soft reference) at the INVOICE stage so dispatch / gate
 * / SAP data is reused, never duplicated.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const { resolveActingUserId } = require('../utils/actingUser');
const stages = require('../config/truckStages');

const TRUCK_AUDIT = 'TRUCK';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genVisitNumber = () => {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const hms = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `TRV-${ymd}-${hms}-${p(Math.floor(Math.random() * 1000), 3)}`;
};

const ALERT_ACTION = {
  DELAY: 'TRUCK_DELAY_ALERT',
  SEQUENCE_VIOLATION: 'TRUCK_SEQUENCE_VIOLATION',
  UNAUTHORIZED_REENTRY: 'TRUCK_UNAUTHORIZED_REENTRY',
};

const raiseAlert = async (tx, { visit, truck, alertType, stage, message, userId }) => {
  const alert = await tx.truckAlert.create({
    data: { visitId: visit.id, truckId: truck.id, alertType, stage, message },
  });
  await auditService.logAction(
    TRUCK_AUDIT, ALERT_ACTION[alertType], visit.id,
    JSON.stringify({ truckNumber: truck.truckNumber, visitNumber: visit.visitNumber, stage, message }),
    userId
  );
  return alert;
};

// ─── Truck master CRUD ────────────────────────────────────────────────────────

const listTrucks = () =>
  prisma.truck.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { visits: true } } } });

const getTruck = async (id) => {
  const truck = await prisma.truck.findUnique({ where: { id }, include: { visits: { orderBy: { entryTime: 'desc' }, take: 20 } } });
  if (!truck) throw new AppError(`Truck "${id}" was not found.`, 404);
  return truck;
};

const createTruck = async (data, actingUserId = null) => {
  const { truckNumber, driverName, driverContact, transporter, vehicleType, rfidTag, status } = data;
  const existing = await prisma.truck.findUnique({ where: { truckNumber } });
  if (existing) throw new AppError(`Truck "${truckNumber}" already exists.`, 409);
  if (rfidTag) {
    const tagClash = await prisma.truck.findUnique({ where: { rfidTag } });
    if (tagClash) throw new AppError(`RFID tag "${rfidTag}" is already assigned to another truck.`, 409);
  }
  const truck = await prisma.truck.create({
    data: { truckNumber, driverName, driverContact, transporter, vehicleType, rfidTag: rfidTag || null, status: status || 'ACTIVE' },
  });
  await auditService.logAction(TRUCK_AUDIT, 'TRUCK_CREATED', truck.id, `Created truck ${truckNumber}`, actingUserId);
  return truck;
};

const updateTruck = async (id, data, actingUserId = null) => {
  const truck = await prisma.truck.findUnique({ where: { id } });
  if (!truck) throw new AppError(`Truck "${id}" was not found.`, 404);

  if (data.truckNumber && data.truckNumber !== truck.truckNumber) {
    const clash = await prisma.truck.findUnique({ where: { truckNumber: data.truckNumber } });
    if (clash) throw new AppError(`Truck "${data.truckNumber}" already exists.`, 409);
  }
  if (data.rfidTag && data.rfidTag !== truck.rfidTag) {
    const clash = await prisma.truck.findUnique({ where: { rfidTag: data.rfidTag } });
    if (clash) throw new AppError(`RFID tag "${data.rfidTag}" is already assigned.`, 409);
  }

  const updated = await prisma.truck.update({
    where: { id },
    data: {
      truckNumber: data.truckNumber ?? truck.truckNumber,
      driverName: data.driverName ?? truck.driverName,
      driverContact: data.driverContact ?? truck.driverContact,
      transporter: data.transporter ?? truck.transporter,
      vehicleType: data.vehicleType ?? truck.vehicleType,
      rfidTag: data.rfidTag === undefined ? truck.rfidTag : (data.rfidTag || null),
      status: data.status ?? truck.status,
    },
  });
  await auditService.logAction(TRUCK_AUDIT, 'TRUCK_UPDATED', id, `Updated truck ${updated.truckNumber}`, actingUserId);
  return updated;
};

// ─── Visits & journey ─────────────────────────────────────────────────────────

const VISIT_INCLUDE = {
  truck: true,
  events: { orderBy: { eventTime: 'asc' }, include: { reader: { select: { id: true, readerCode: true, readerName: true, stage: true } } } },
  alerts: { orderBy: { createdAt: 'desc' } },
};

const listVisits = async ({ status = null, risk = null, truckId = null, limit = 100 } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (risk) where.riskStatus = risk;
  if (truckId) where.truckId = truckId;
  return prisma.truckVisit.findMany({
    where,
    include: { truck: true, _count: { select: { events: true, alerts: true } }, alerts: { where: { resolved: false }, select: { id: true, alertType: true } } },
    orderBy: { entryTime: 'desc' },
    take: Math.min(Number(limit) || 100, 500),
  });
};

/**
 * Full journey for a visit — events, alerts, and the linked dispatch with its
 * gate validations + SAP validation logs (resolved via the soft reference).
 */
const getJourney = async (visitId) => {
  const visit = await prisma.truckVisit.findUnique({ where: { id: visitId }, include: VISIT_INCLUDE });
  if (!visit) throw new AppError(`Visit "${visitId}" was not found.`, 404);

  let dispatch = null;
  let sapValidations = [];
  if (visit.dispatchId) {
    dispatch = await prisma.dispatch.findUnique({
      where: { id: visit.dispatchId },
      include: {
        lot: { include: { material: true } },
        bay: true,
        gateValidations: { orderBy: { createdAt: 'desc' } },
      },
    }).catch(() => null);
    sapValidations = await prisma.sAPValidationLog.findMany({
      where: { entityId: visit.dispatchId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []);
  }

  return { visit, dispatch, sapValidations };
};

const minsBetween = (a, b) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

/** Operations dashboard summary. */
const getDashboard = async () => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  const [active, parked, exitedToday, openAlerts, recentAlerts] = await Promise.all([
    prisma.truckVisit.findMany({ where: { status: 'ACTIVE' }, include: { truck: true, events: { orderBy: { eventTime: 'desc' }, take: 1 } }, orderBy: { entryTime: 'asc' } }),
    prisma.truckVisit.count({ where: { status: 'PARKED' } }),
    prisma.truckVisit.findMany({ where: { status: 'EXITED', exitTime: { gte: startOfDay } } }),
    prisma.truckAlert.count({ where: { resolved: false } }),
    prisma.truckAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { visit: { select: { visitNumber: true, truck: { select: { truckNumber: true } } } } } }),
  ]);

  // Average turnaround (minutes) over today's completed visits.
  const turnarounds = exitedToday.filter((v) => v.exitTime && v.entryTime).map((v) => minsBetween(v.entryTime, v.exitTime));
  const avgTurnaround = turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : 0;

  // Compute live risk for trucks currently inside.
  const now = Date.now();
  const insideYard = active.map((v) => {
    const last = v.events[0];
    const stuckMs = last ? now - new Date(last.eventTime).getTime() : 0;
    const delayed = v.currentStage ? stuckMs > stages.delayThreshold(v.currentStage) : false;
    return {
      id: v.id,
      visitNumber: v.visitNumber,
      truckNumber: v.truck.truckNumber,
      driverName: v.truck.driverName,
      currentStage: v.currentStage,
      entryTime: v.entryTime,
      minutesInYard: minsBetween(v.entryTime, new Date()),
      minutesInStage: last ? minsBetween(last.eventTime, new Date()) : 0,
      riskStatus: v.riskStatus === 'FLAGGED' ? 'FLAGGED' : (delayed ? 'DELAYED' : 'NORMAL'),
    };
  });
  const delayedCount = insideYard.filter((t) => t.riskStatus === 'DELAYED').length;

  return {
    insideYardCount: active.length,
    parkedCount: parked,
    exitedTodayCount: exitedToday.length,
    avgTurnaroundMins: avgTurnaround,
    delayedCount,
    exceptionsCount: openAlerts,
    insideYard,
    recentAlerts,
  };
};

// ─── RFID event rule engine ───────────────────────────────────────────────────

/**
 * Record a single lifecycle event (the one pipeline used by both the simulator
 * and future hardware). Transactional and append-only.
 *
 * @param {{ truck: object, stage: string, readerId?: string, source?: string, rawTag?: string, eventTime?: Date, actingUserId?: string }} input
 *   `truck` is the already-resolved Truck record.
 * @returns {Promise<{ visit, event, alerts }>}
 */
const recordEvent = async ({ truck, stage, readerId = null, source = 'SIMULATED', rawTag = null, eventTime = null, actingUserId = null }) => {
  if (!stages.isValidStage(stage)) throw new AppError(`Unknown stage "${stage}".`, 400);
  const ts = eventTime ? new Date(eventTime) : new Date();

  return prisma.$transaction(async (tx) => {
    const userId = await resolveActingUserId(tx, actingUserId);
    const alerts = [];

    // Find the truck's currently-open visit (inside the yard or parked).
    let visit = await tx.truckVisit.findFirst({
      where: { truckId: truck.id, status: { in: ['ACTIVE', 'PARKED'] } },
      orderBy: { entryTime: 'desc' },
    });

    // ── Resolve / create the visit for this event ──────────────────────────
    if (stage === 'ENTRY_GATE') {
      if (visit) {
        // Already inside but scanned at entry again → anomaly, keep history.
        const a = await raiseAlert(tx, { visit, truck, alertType: 'SEQUENCE_VIOLATION', stage, message: 'Entry scan while a visit is already open.', userId });
        alerts.push(a);
      } else {
        visit = await tx.truckVisit.create({
          data: { visitNumber: genVisitNumber(), truckId: truck.id, status: 'ACTIVE', currentStage: null, entryTime: ts },
        });
        await auditService.logAction(TRUCK_AUDIT, 'TRUCK_ENTERED', visit.id, JSON.stringify({ truckNumber: truck.truckNumber, visitNumber: visit.visitNumber }), userId);
      }
    } else if (!visit) {
      // Non-entry event with no open visit → orphan; record it but flag.
      visit = await tx.truckVisit.create({
        data: { visitNumber: genVisitNumber(), truckId: truck.id, status: 'ACTIVE', currentStage: null, entryTime: ts, riskStatus: 'FLAGGED' },
      });
      const a = await raiseAlert(tx, { visit, truck, alertType: 'SEQUENCE_VIOLATION', stage, message: `Scan at ${stage} without a recorded yard entry.`, userId });
      alerts.push(a);
    }

    // Last event of this visit BEFORE appending the new one (for delay + order).
    const prevEvent = await tx.truckEvent.findFirst({ where: { visitId: visit.id }, orderBy: { eventTime: 'desc' } });
    const prevStage = visit.currentStage;

    // ── Append the immutable event ─────────────────────────────────────────
    const event = await tx.truckEvent.create({
      data: { visitId: visit.id, truckId: truck.id, stage, readerId, source, rawTag, eventTime: ts },
    });
    await auditService.logAction(TRUCK_AUDIT, 'RFID_EVENT_RECEIVED', event.id, JSON.stringify({ truckNumber: truck.truckNumber, visitNumber: visit.visitNumber, stage, source }), userId);

    let riskStatus = visit.riskStatus;

    // ── Rule 1 & 2: post-invoice behaviour ─────────────────────────────────
    if (visit.invoiceAt && stage !== 'INVOICE') {
      if (stage === 'LOADING_DOCK') {
        const a = await raiseAlert(tx, { visit, truck, alertType: 'UNAUTHORIZED_REENTRY', stage, message: 'Truck returned to the Loading Dock after invoice generation — possible unrecorded loading.', userId });
        alerts.push(a);
        riskStatus = 'FLAGGED';
      } else if (!stages.POST_INVOICE_ALLOWED.includes(stage)) {
        const a = await raiseAlert(tx, { visit, truck, alertType: 'SEQUENCE_VIOLATION', stage, message: `Invalid stage "${stage}" after invoice — only parking or exit are permitted.`, userId });
        alerts.push(a);
        riskStatus = 'FLAGGED';
      }
    } else if (prevStage && stages.order(stage) < stages.order(prevStage)) {
      // ── Rule 4: backwards in the sequence ────────────────────────────────
      const a = await raiseAlert(tx, { visit, truck, alertType: 'SEQUENCE_VIOLATION', stage, message: `Out-of-sequence movement: ${prevStage} → ${stage}.`, userId });
      alerts.push(a);
      riskStatus = 'FLAGGED';
    }

    // ── Rule 3: excessive dwell in the previous stage ──────────────────────
    if (prevEvent && prevStage) {
      const dwell = ts.getTime() - new Date(prevEvent.eventTime).getTime();
      if (dwell > stages.delayThreshold(prevStage)) {
        const mins = Math.round(dwell / 60000);
        const a = await raiseAlert(tx, { visit, truck, alertType: 'DELAY', stage: prevStage, message: `Truck spent ${mins} min at ${prevStage}, exceeding the allowed window.`, userId });
        alerts.push(a);
        if (riskStatus !== 'FLAGGED') riskStatus = 'DELAYED';
      }
    }

    // ── Apply stage transition + lifecycle status ──────────────────────────
    const data = { currentStage: stage, riskStatus };
    if (stage === 'INVOICE') {
      data.invoiceAt = ts;
      // Soft-link to the matching dispatch (reuse dispatch/gate/SAP — no dup).
      const dispatch = await tx.dispatch.findFirst({
        where: { vehicleNumber: truck.truckNumber },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null);
      if (dispatch) data.dispatchId = dispatch.id;
    }
    if (stage === 'PARKING') data.status = 'PARKED';
    if (stage === 'EXIT_GATE') {
      data.status = 'EXITED';
      data.exitTime = ts;
    }
    const updatedVisit = await tx.truckVisit.update({ where: { id: visit.id }, data });

    if (stage === 'EXIT_GATE') {
      await auditService.logAction(TRUCK_AUDIT, 'TRUCK_EXITED', visit.id, JSON.stringify({ truckNumber: truck.truckNumber, visitNumber: visit.visitNumber, durationMins: minsBetween(updatedVisit.entryTime, ts) }), userId);
    }

    // Heartbeat the reader (a scan implies the reader is alive).
    if (readerId) {
      await tx.rFIDReader.update({ where: { id: readerId }, data: { lastHeartbeat: new Date(), status: 'ONLINE' } }).catch(() => {});
    }

    return { visit: updatedVisit, event, alerts };
  });
};

module.exports = {
  listTrucks,
  getTruck,
  createTruck,
  updateTruck,
  listVisits,
  getJourney,
  getDashboard,
  recordEvent,
};
