const { getDb } = require('./db');

async function checkAdminExists() {
    const db = getDb();
    const admin = await db.get('SELECT * FROM usuarios WHERE rol = ?', ['admin']);
    return admin;
}

async function createAdminUser(username, passwordHash, ip, userAgent, fingerprint) {
    const db = getDb();
    const codigoInvitacion = Math.random().toString(36).substring(2, 10);
    
    const result = await db.run(`
        INSERT INTO usuarios (
            username, username_original, password_hash, rol, creditos,
            ip_registro, ip_actual, user_agent, fingerprint, codigo_invitacion,
            ultimo_credito_diario, fecha_registro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        username, username, passwordHash, 'admin', 999999,
        ip, ip, userAgent, fingerprint, codigoInvitacion,
        new Date().toISOString(), new Date().toISOString()
    ]);
    
    return result.lastID;
}

async function createDefaultUser(username, fingerprint, ip, userAgent) {
    const db = getDb();
    const codigoInvitacion = Math.random().toString(36).substring(2, 10);
    
    const result = await db.run(`
        INSERT INTO usuarios (
            username, username_original, rol, creditos,
            ip_registro, ip_actual, user_agent, fingerprint, codigo_invitacion,
            ultimo_credito_diario, fecha_registro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        username, username, 'user', 3,
        ip, ip, userAgent, fingerprint, codigoInvitacion,
        new Date().toISOString(), new Date().toISOString()
    ]);
    
    return result.lastID;
}

module.exports = {
    checkAdminExists,
    createAdminUser,
    createDefaultUser
};