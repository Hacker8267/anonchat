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
const logger = require('../utils/logger');

const router = express.Router();

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
        console.log('Username recibido:', username);
        console.log('Base de datos:', isPG ? 'PostgreSQL' : 'SQLite');
        
        // Obtener fingerprint del dispositivo
        const fingerprint = generateFingerprint(req);
        const fingerprintEncriptado = encrypt(fingerprint) || fingerprint;
        
        // VERIFICAR si este dispositivo YA TIENE una cuenta
        let dispositivoExistente = null;
        if (isPG) {
            const result = await db.query('SELECT id, username FROM usuarios WHERE fingerprint = $1', [fingerprintEncriptado]);
            dispositivoExistente = result.rows[0];
        } else {
            dispositivoExistente = await db.get('SELECT id, username FROM usuarios WHERE fingerprint = ?', [fingerprintEncriptado]);
        }
        
        if (dispositivoExistente) {
            console.log('🚫 Este dispositivo ya tiene una cuenta:', dispositivoExistente.username);
            return res.status(409).json({ 
                error: 'Este dispositivo ya tiene una cuenta. Inicia sesión con tu usuario.',
                usuario_existente: dispositivoExistente.username,
                cuenta_id: dispositivoExistente.id,
                iniciar_sesion: true
            });
        }
        
        // Generar nombre automático si no se proporciona
        if (!username || username === '') {
            const randomNum = Math.floor(Math.random() * 10000);
            username = `anon_${randomNum}`;
            
            let exists = null;
            if (isPG) {
                const result = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
                exists = result.rows[0];
            } else {
                exists = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
            }
            
            let counter = 1;
            while (exists) {
                username = `anon_${randomNum}_${counter}`;
                if (isPG) {
                    const result = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
                    exists = result.rows[0];
                } else {
                    exists = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
                }
                counter++;
            }
            console.log('Nombre automático generado:', username);
        } else {
            if (username.length < 3 || username.length > 20) {
                return res.status(400).json({ error: 'El nombre debe tener entre 3 y 20 caracteres' });
            }
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                return res.status(400).json({ error: 'El nombre solo puede contener letras, números y guión bajo' });
            }
            
            let existe = null;
            if (isPG) {
                const result = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
                existe = result.rows[0];
            } else {
                existe = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
            }
            
            if (existe) {
                return res.status(400).json({ error: 'Este nombre ya está en uso' });
            }
            
            if (await contieneInsultos(username)) {
                return res.status(400).json({ error: 'El nombre contiene lenguaje ofensivo' });
            }
        }
        
        // Obtener datos del dispositivo
        const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const deviceInfo = getDeviceInfo(userAgent);
        
        let ipEncriptada, userAgentEncriptado, dispositivoEncriptado;
        try {
            ipEncriptada = encrypt(ip) || ip;
            userAgentEncriptado = encrypt(userAgent) || userAgent;
            dispositivoEncriptado = encrypt(JSON.stringify(deviceInfo)) || JSON.stringify(deviceInfo);
        } catch (encError) {
            ipEncriptada = ip;
            userAgentEncriptado = userAgent;
            dispositivoEncriptado = JSON.stringify(deviceInfo);
        }
        
        const codigoNuevo = Math.random().toString(36).substring(2, 10);
        
        let invitadoPor = null;
        if (codigoInvitacion) {
            let invitador = null;
            if (isPG) {
                const result = await db.query('SELECT id FROM usuarios WHERE codigo_invitacion = $1', [codigoInvitacion]);
                invitador = result.rows[0];
            } else {
                invitador = await db.get('SELECT id FROM usuarios WHERE codigo_invitacion = ?', [codigoInvitacion]);
            }
            if (invitador) {
                invitadoPor = invitador.id;
                try {
                    await agregarCreditos(invitador.id, config.CREDITS_POR_INVITACION, 'invitacion', 'Invitó a un usuario');
                } catch (err) {}
            }
        }
        
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
        
        console.log('✅ Usuario creado con ID:', userId);
        
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
        res.status(500).json({ error: 'Error al registrar usuario: ' + error.message });
    }
});

// INICIAR SESIÓN EN CUENTA EXISTENTE
router.post('/login', [
    body('username').notEmpty(),
    body('password').optional()
], async (req, res) => {
    try {
        const { username } = req.body;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        console.log('=== INTENTO LOGIN ===');
        console.log('Usuario:', username);
        
        let user = null;
        if (isPG) {
            const result = await db.query('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE username = $1', [username]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE username = ?', [username]);
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }
        
        if (user.esta_bloqueado) {
            return res.status(403).json({ error: 'Usuario bloqueado' });
        }
        
        const fingerprint = generateFingerprint(req);
        const fingerprintEncriptado = encrypt(fingerprint) || fingerprint;
        const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const ipEncriptada = encrypt(ip) || ip;
        
        if (isPG) {
            await db.query(`
                UPDATE usuarios SET fingerprint = $1, ip_actual = $2, ultimo_acceso = $3
                WHERE id = $4
            `, [fingerprintEncriptado, ipEncriptada, new Date().toISOString(), user.id]);
        } else {
            await db.run(`
                UPDATE usuarios SET fingerprint = ?, ip_actual = ?, ultimo_acceso = ?
                WHERE id = ?
            `, [fingerprintEncriptado, ipEncriptada, new Date().toISOString(), user.id]);
        }
        
        const token = generateToken(user.id);
        
        if (isPG) {
            await db.query(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES ($1, $2, $3, $4)
            `, [user.id, token, ipEncriptada, req.headers['user-agent'] || 'unknown']);
        } else {
            await db.run(`
                INSERT INTO sesiones (usuario_id, token, ip, user_agent)
                VALUES (?, ?, ?, ?)
            `, [user.id, token, ipEncriptada, req.headers['user-agent'] || 'unknown']);
        }
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                rol: user.rol,
                creditos: user.creditos
            }
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
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
        
        console.log('=== INTENTO LOGIN ADMIN ===');
        console.log('Usuario:', username);
        
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
        
        const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
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
        
        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                rol: admin.rol
            }
        });
        
    } catch (error) {
        console.error('Error en login admin:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Verificar token
router.get('/verify', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ valid: false });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let session = null;
        if (isPG) {
            const result = await db.query('SELECT * FROM sesiones WHERE token = $1 AND activa = true', [token]);
            session = result.rows[0];
        } else {
            session = await db.get('SELECT * FROM sesiones WHERE token = ? AND activa = 1', [token]);
        }
        
        if (!session) {
            return res.status(401).json({ valid: false });
        }
        
        let user = null;
        if (isPG) {
            const result = await db.query('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = $1', [decoded.userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = ?', [decoded.userId]);
        }
        
        if (!user || user.esta_bloqueado) {
            return res.status(401).json({ valid: false });
        }
        
        res.json({ valid: true, user });
    } catch (error) {
        console.error('Error verificando token:', error);
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
            await db.run('UPDATE sesiones SET activa = 0, fecha_fin = ? WHERE token = ?', [
                new Date().toISOString(),
                token
            ]);
        }
    }
    
    res.json({ success: true });
});

module.exports = router;