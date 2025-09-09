// src/server/services/audit.service.js
import crypto from 'crypto';
import { AuditLog } from '../models/AuditLog.js';

export async function logAudit(req, { entity, action, entityId = null, meta = null }) {
  try {
    const user = req?.session?.user || req?.user || null;
    const userId = user?.id || null;
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').toString();
    const ua = (req.headers['user-agent'] || '').toString();
    const id = crypto.randomBytes(9).toString('base64url');
    const metaJson = meta ? JSON.stringify(meta) : null;
    await AuditLog.create({ id, entity, action, entityId, userId, ip, ua, metaJson });
  } catch (e) {
    // Non-fatal: do not block primary flow if auditing fails
    // eslint-disable-next-line no-console
    console.warn?.('Audit log failed:', e?.message || e);
  }
}

