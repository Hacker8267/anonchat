const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { getDb, isPostgreSQL } = require('../database/db');
const { generateToken } = require('../middleware/auth');
const { generateFingerprint, getDeviceInfo } = require('../crypto/fingerprint');
const { encrypt } = require('../crypto/aes');
const { agregarCreditos } = require('../services/creditos');
const config = require('../config/env');
const { contieneInsultos } = require('../utils/profanity');

const router = express.Router();

// Helper para ejecutar consultas según la BD
async function executeQuery(db, isPG, query, params, isSelect = true) {
    if (isPG) {
        const result = await db.query(query, params);
        return isSelect ? result.rows : result;
    } else {
        if (isSelect) {
            return await db.get(query, params);
        } else {
            return await db.run(query, params);
        }
    }
}

// Registrar nuevo usuario anónimo
router.post('/register', [
    body('username').optional().trim(),
    body('invitacion').optional().trim()
], async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        let username = req.body.username;
        const codigoInvitacion = req.body.invitacion;
        
        console.log('=== REGISTRO NUEVO USUARIO ===');
        console.log('Username:', username);
        console.log('Base de datos:', isPG ? 'PostgreSQL' : 'SQLite');
        
        // Obtener fingerprint
        const fingerprint = generateFingerprint(req);
        const fingerprintEncriptado = encrypt(fingerprint) || fingerprint;
        
        // Verificar si el dispositivo ya tiene cuenta
        let dispositivoExistente = null;
        if (isPG) {
            const result = await db.query('SELECT id, username FROM usuarios WHERE fingerprint = $1', [fingerprintEncriptado]);
            dispositivoExistente = result.rows[0];
        } else {
            dispositivoExistente = await db.get('SELECT id, username FROM usuarios WHERE fingerprint = ?', [fingerprintEncriptado]);
        }
        
        if (dispositivoExistente) {
            console.log('🚫 Dispositivo ya tiene cuenta:', dispositivoExistente.username);
            return res.status(409).json({
                error: 'Este dispositivo ya tiene una cuenta. Inicia sesión.',
                usuario_existente: dispositivoExistente.username
            });
        }
        
        // Generar nombre si está vacío
        if (!username || username === '') {
            const randomNum = Math.floor(Math.random() * 10000);
            username = `anon_${randomNum}`;
            
            let exists = true;
            let counter = 1;
            while (exists) {
                if (isPG) {
                    const result = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
                    exists = result.rows[0];
                } else {
                    exists = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
                }
                if (exists) {
                    username = `anon_${randomNum}_${counter}`;
                    counter++;
                }
            }
            console.log('Nombre generado:', username);
        } else {
            if (username.length < 3 || username.length > 20) {
                return res.status(400).json({ error: 'El nombre debe tener entre 3 y 20 caracteres' });
            }
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                return res.status(400).json({ error: 'Solo letras, números y guión bajo' });
            }
            
            let existe = null;
            if (isPG) {
                const result = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
                existe = result.rows[0];
            } else {
                existe = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
            }
            
            if (existe) {
                return res.status(400).json({ error: 'Nombre ya en uso' });
            }
            
            if (await contieneInsultos(username)) {
                return res.status(400).json({ error: 'Nombre ofensivo' });
            }
        }
        
        // Datos del dispositivo
        const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const deviceInfo = getDeviceInfo(userAgent);
        
        const ipEncriptada = encrypt(ip) || ip;
        const userAgentEncriptado = encrypt(userAgent) || userAgent;
        const dispositivoEncriptado = encrypt(JSON.stringify(deviceInfo)) || JSON.stringify(deviceInfo);
        const codigoNuevo = Math.random().toString(36).substring(2, 10);
        
        // Verificar invitación
        let invitadoPor = null;
        if (codigoInvitacion) {
            try {
                let invitador = null;
                if (isPG) {
                    const result = await db.query('SELECT id FROM usuarios WHERE codigo_invitacion = $1', [codigoInvitacion]);
                    invitador = result.rows[0];
                } else {
                    invitador = await db.get('SELECT id FROM usuarios WHERE codigo_invitacion = ?', [codigoInvitacion]);
                }
                if (invitador) {
                    invitadoPor = invitador.id;
                    await agregarCreditos(invitador.id, config.CREDITS_POR_INVITACION, 'invitacion', 'Invitó a un usuario');
                }
            } catch (err) {}
        }
        
        // Crear usuario
        let userId;
        if (isPG) {
            const result = await db.query(`
                INSERT INTO usuarios (
                    username, username_original, rol, creditos,
                    ip_registro, ip_actual, user_agent, fingerprint, dispositivo,
                    codigo_invitacion, invitado_por, ultimo_credito_diario, fecha_registro
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `, [
                username, username, 'user', config.CREDITS_REGISTRO_INICIAL || 3,
                ipEncriptada, ipEncriptada, userAgentEncriptado, fingerprintEncriptado, dispositivoEncriptado,
                codigoNuevo, invitadoPor, new Date().toISOString(), new Date().toISOString()
            ]);
            userId = result.rows[0].id;
        } else {
            const result = await db.run(`
                INSERT INTO usuarios (
                    username, username_original, rol, creditos,
                    ip_registro, ip_actual, user_agent, fingerprint, dispositivo,
                    codigo_invitacion, invitado_por, ultimo_credito_diario, fecha_registro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                username, username, 'user', config.CREDITS_REGISTRO_INICIAL || 3,
                ipEncriptada, ipEncriptada, userAgentEncriptado, fingerprintEncriptado, dispositivoEncriptado,
                codigoNuevo, invitadoPor, new Date().toISOString(), new Date().toISOString()
            ]);
            userId = result.lastID;
        }
        
        console.log('✅ Usuario creado ID:', userId);
        
        const token = generateToken(userId);
        
        if (isPG) {
            await db.query(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES ($1, $2, $3, $4)
            `, [userId, token, ipEncriptada, userAgentEncriptado]);
        } else {
            await db.run(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES (?, ?, ?, ?)
            `, [userId, token, ipEncriptada, userAgentEncriptado]);
        }
        
        res.json({
            success: true,
            token,
            user: {
                id: userId,
                username,
                rol: 'user',
                creditos: config.CREDITS_REGISTRO_INICIAL || 3,
                codigo_invitacion: codigoNuevo
            }
        });
        
    } catch (error) {
        console.error('❌ Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar: ' + error.message });
    }
});

// Login admin
router.post('/admin-login', [
    body('username').trim().notEmpty(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        console.log('=== LOGIN ADMIN ===');
        
        let admin = null;
        if (isPG) {
            const result = await db.query('SELECT * FROM usuarios WHERE username = $1 AND rol = $2', [username, 'admin']);
            admin = result.rows[0];
        } else {
            admin = await db.get('SELECT * FROM usuarios WHERE username = ? AND rol = ?', [username, 'admin']);
        }
        
        if (!admin) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'unknown';
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ userId: admin.id }, config.JWT_SECRET, { expiresIn: '24h' });
        
        if (isPG) {
            await db.query(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES ($1, $2, $3, $4)
            `, [admin.id, token, ip, userAgent]);
        } else {
            await db.run(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES (?, ?, ?, ?)
            `, [admin.id, token, ip, userAgent]);
        }
        
        res.json({ success: true, token, admin: { id: admin.id, username: admin.username, rol: admin.rol } });
        
    } catch (error) {
        console.error('Error login admin:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Verificar token
router.get('/verify', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ valid: false });
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let user = null;
        if (isPG) {
            const result = await db.query('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = $1', [decoded.userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = ?', [decoded.userId]);
        }
        
        if (!user) return res.status(401).json({ valid: false });
        res.json({ valid: true, user });
    } catch (error) {
        res.status(401).json({ valid: false });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
        const db = getDb();
        const isPG = isPostgreSQL();
        if (isPG) {
            await db.query('UPDATE sesiones SET activa = false, fecha_fin = NOW() WHERE token = $1', [token]);
        } else {
            await db.run('UPDATE sesiones SET activa = 0, fecha_fin = ? WHERE token = ?', [new Date().toISOString(), token]);
        }
    }
    res.json({ success: true });
});

module.exports = router;