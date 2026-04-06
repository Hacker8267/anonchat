const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { getDb } = require('../database/db');

async function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const db = getDb();
        
        const session = await db.get(
            'SELECT * FROM sesiones WHERE token = ? AND activa = 1 AND (fecha_fin IS NULL OR fecha_fin > ?)',
            [token, new Date().toISOString()]
        );
        
        if (!session) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }
        
        const user = await db.get(
            'SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = ?',
            [decoded.userId]
        );
        
        if (!user || user.esta_bloqueado) {
            return res.status(403).json({ error: 'Usuario bloqueado o no existe' });
        }
        
        req.user = user;
        req.sessionId = session.id;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

function verifyAdmin(req, res, next) {
    if (!req.user || req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador' });
    }
    next();
}

function generateToken(userId) {
    return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '24h' });
}

module.exports = {
    verifyToken,
    verifyAdmin,
    generateToken
};