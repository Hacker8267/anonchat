const { getDb } = require('../database/db');
const crypto = require('crypto');

async function logAdminAction(adminId, action, usuarioAfectadoId, detalles, adminIp) {
    const db = getDb();
    const dataString = `${adminId}|${action}|${usuarioAfectadoId}|${detalles}|${Date.now()}`;
    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    
    await db.run(`
        INSERT INTO auditoria_admin (accion, admin_id, admin_ip, usuario_afectado_id, detalles, hash_verificacion)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [action, adminId, adminIp, usuarioAfectadoId, detalles, hash]);
}

async function checkAdminIpWhitelist(ip) {
    const whitelist = require('../config/env').ADMIN_IP_WHITELIST;
    if (whitelist.length === 0) return true;
    return whitelist.includes(ip);
}

module.exports = {
    logAdminAction,
    checkAdminIpWhitelist
};