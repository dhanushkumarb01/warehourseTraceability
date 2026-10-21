/**
 * faceService — Employee Face Registry (Phase 14).
 *
 * The reusable identity layer behind the Face Detection / Unknown Person use
 * case. Employees are registered here and one or more face images are enrolled
 * per employee. Enrollment calls the AI worker's face-embedding endpoint and
 * stores ONLY the resulting embedding vector + metadata — the uploaded images
 * are never persisted and never used directly for recognition.
 *
 * The live pipeline consumes these embeddings through the internal
 * `GET /api/surveillance/ai/faces` endpoint (surveillanceService.listFacesForWorker),
 * loading them once into a shared in-memory gallery so recognition scales to
 * thousands of employees across many cameras.
 *
 * Reuses: config/prisma, config/env, utils/AppError, services/auditService.
 */

'use strict';

const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');

const AUDIT = 'FACE_REGISTRY';

const EMPLOYEE_SELECT = {
  id: true, employeeCode: true, name: true, department: true, designation: true,
  status: true, createdAt: true, updatedAt: true,
};

// Face rows exposed to the UI carry metadata only — never the embedding vector.
const FACE_META_SELECT = { id: true, model: true, quality: true, createdAt: true };

const withFaceCount = (emp) => {
  if (!emp) return emp;
  const { _count, ...rest } = emp;
  return { ...rest, faceCount: _count ? _count.faces : undefined };
};

// ─── Employee CRUD ────────────────────────────────────────────────────────────
const listEmployees = async (q = {}) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));

  const where = {};
  if (q.status) where.status = q.status;
  if (q.search) {
    const s = String(q.search).trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { employeeCode: { contains: s, mode: 'insensitive' } },
      { department: { contains: s, mode: 'insensitive' } },
      { designation: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: { ...EMPLOYEE_SELECT, _count: { select: { faces: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(withFaceCount),
    total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const getEmployee = async (id) => {
  const emp = await prisma.employee.findUnique({
    where: { id },
    select: { ...EMPLOYEE_SELECT, faces: { select: FACE_META_SELECT, orderBy: { createdAt: 'desc' } } },
  });
  if (!emp) throw new AppError(`Employee "${id}" was not found.`, 404);
  return emp;
};

const createEmployee = async (payload, actorId) => {
  const employeeCode = String(payload.employeeCode || '').trim();
  const name = String(payload.name || '').trim();
  if (!employeeCode) throw new AppError('Employee ID (code) is required.', 400);
  if (!name) throw new AppError('Employee name is required.', 400);

  const exists = await prisma.employee.findUnique({ where: { employeeCode } });
  if (exists) throw new AppError(`Employee ID "${employeeCode}" already exists.`, 409);

  const emp = await prisma.employee.create({
    data: {
      employeeCode,
      name,
      department: payload.department ? String(payload.department).trim() : null,
      designation: payload.designation ? String(payload.designation).trim() : null,
      status: payload.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    },
    select: EMPLOYEE_SELECT,
  });
  await auditService.logAction(AUDIT, 'EMPLOYEE_CREATED', emp.id, `Registered employee ${name} (${employeeCode})`, actorId);
  return { ...emp, faceCount: 0 };
};

const updateEmployee = async (id, patch, actorId) => {
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) throw new AppError(`Employee "${id}" was not found.`, 404);

  const data = {};
  if (patch.employeeCode !== undefined) {
    const code = String(patch.employeeCode).trim();
    if (!code) throw new AppError('Employee ID (code) cannot be empty.', 400);
    if (code !== emp.employeeCode) {
      const clash = await prisma.employee.findUnique({ where: { employeeCode: code } });
      if (clash) throw new AppError(`Employee ID "${code}" already exists.`, 409);
      data.employeeCode = code;
    }
  }
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new AppError('Employee name cannot be empty.', 400);
    data.name = name;
  }
  if (patch.department !== undefined) data.department = patch.department ? String(patch.department).trim() : null;
  if (patch.designation !== undefined) data.designation = patch.designation ? String(patch.designation).trim() : null;
  if (patch.status !== undefined) data.status = patch.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const updated = await prisma.employee.update({ where: { id }, data, select: { ...EMPLOYEE_SELECT, _count: { select: { faces: true } } } });
  await auditService.logAction(AUDIT, 'EMPLOYEE_UPDATED', id, `Updated employee ${updated.name} (${updated.employeeCode})`, actorId);
  return withFaceCount(updated);
};

const deleteEmployee = async (id, actorId) => {
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) throw new AppError(`Employee "${id}" was not found.`, 404);
  await prisma.employee.delete({ where: { id } }); // cascades to EmployeeFace
  await auditService.logAction(AUDIT, 'EMPLOYEE_DELETED', id, `Deleted employee ${emp.name} (${emp.employeeCode}) and all enrolled faces`, actorId);
  return { id, deleted: true };
};

// ─── Face enrollment (image → embedding via AI worker; store embedding only) ──
/**
 * Send a base64 image to the AI enrollment endpoint and get back a validated
 * face embedding. Validation (exactly one clearly-visible, acceptable-quality
 * face) is performed by the AI worker using the SAME model used for live
 * recognition, so enrolled and live embeddings are directly comparable.
 */
const embedImage = async (imageBase64) => {
  if (!env.AI_SERVICE_TOKEN) {
    throw new AppError('Face enrollment is not configured (AI_SERVICE_TOKEN unset).', 503);
  }
  const url = `${String(env.AI_ENROLLMENT_URL).replace(/\/$/, '')}/faces/embed`;

  let resp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_ENROLLMENT_TIMEOUT_MS);
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Token': env.AI_SERVICE_TOKEN },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    throw new AppError('The face enrollment service is unavailable. Ensure the AI worker is running.', 503);
  }

  let json = null;
  try { json = await resp.json(); } catch { json = null; }

  if (!resp.ok || !json || !json.success) {
    const code = json && json.code;
    const map = {
      NO_FACE: 'No face was detected in the image. Use a clear, front-facing photo.',
      MULTIPLE_FACES: 'The image contains more than one face. Upload a photo with exactly one face.',
      LOW_QUALITY: 'The face is too small or unclear. Use a higher-quality, closer photo.',
      NO_MODEL: 'The face recognition model is not available on the AI worker.',
    };
    const message = (code && map[code]) || (json && json.message) || 'The image could not be enrolled.';
    const status = resp.status === 422 ? 422 : (resp.status >= 500 ? 502 : 400);
    throw new AppError(message, status);
  }
  return json.data; // { embedding, detScore, model }
};

const addFace = async (employeeId, imageBase64, actorId) => {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new AppError(`Employee "${employeeId}" was not found.`, 404);
  if (!imageBase64) throw new AppError('A face image is required.', 400);

  const embed = await embedImage(imageBase64);
  if (!Array.isArray(embed.embedding) || embed.embedding.length === 0) {
    throw new AppError('Enrollment did not return a valid embedding.', 502);
  }

  const face = await prisma.employeeFace.create({
    data: {
      employeeId,
      embedding: embed.embedding,
      model: embed.model || 'insightface',
      quality: typeof embed.detScore === 'number' ? embed.detScore : null,
    },
    select: FACE_META_SELECT,
  });
  await auditService.logAction(AUDIT, 'FACE_ENROLLED', employeeId, `Enrolled a face for ${emp.name} (${emp.employeeCode})`, actorId);

  const faceCount = await prisma.employeeFace.count({ where: { employeeId } });
  return { face, faceCount };
};

const listFaces = async (employeeId) => {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new AppError(`Employee "${employeeId}" was not found.`, 404);
  const faces = await prisma.employeeFace.findMany({ where: { employeeId }, select: FACE_META_SELECT, orderBy: { createdAt: 'desc' } });
  return { employeeId, faces };
};

const deleteFace = async (employeeId, faceId, actorId) => {
  const face = await prisma.employeeFace.findUnique({ where: { id: faceId } });
  if (!face || face.employeeId !== employeeId) throw new AppError(`Face "${faceId}" was not found for this employee.`, 404);
  await prisma.employeeFace.delete({ where: { id: faceId } });
  await auditService.logAction(AUDIT, 'FACE_DELETED', employeeId, `Removed an enrolled face`, actorId);
  const faceCount = await prisma.employeeFace.count({ where: { employeeId } });
  return { id: faceId, deleted: true, faceCount };
};

// ─── Registry summary (dashboard / management header) ─────────────────────────
const getSummary = async () => {
  const [employees, active, faces] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.employeeFace.count(),
  ]);
  return { employees, active, inactive: employees - active, enrolledFaces: faces };
};

module.exports = {
  listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  addFace, listFaces, deleteFace, getSummary,
  // exposed for tests
  embedImage,
};
