const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/db');
const { generateToken } = require('../middleware/auth');
const { generateFingerprint, getDeviceInfo } = require('../crypto/fingerprint');
const { encrypt } = require('../crypto/aes');
const { agregarCreditos } = require('../services/creditos');
const config = require('../config/env');
const { isUsernameAvailable, isUsernameValid } = require('../utils/validators');
const { filtrarInsultos, contieneInsultos } = require('../utils/profanity');
const logger = require('../utils/logger');

const router = express.Router();

// Registrar nuevo usuario anónimo
router.post('/register', [
    body('username').optional().trim(),
    body('invitacion').optional().trim()
], async (req, res) => {
    try {
        const db = getDb();
        let username = req.body.username;
        const codigoInvitacion = req.body.invitacion;
        
        console.log('=== REGISTRO NUEVO USUARIO ===');
        console.log('Username recibido:', username);
        
        // Generar nombre automático si no se proporciona
        if (!username || username === '') {
            const randomNum = Math.floor(Math.random() * 10000);
            username = `anon_${randomNum}`;
            
            let exists = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
            let counter = 1;
            while (exists) {
                username = `anon_${randomNum}_${counter}`;
                exists = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
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
            
            const existe = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
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
        const fingerprint = generateFingerprint(req);
        const deviceInfo = getDeviceInfo(userAgent);
        
        console.log('IP:', ip);
        console.log('Fingerprint generado:', fingerprint.substring(0, 20) + '...');
        
        // Encriptar datos sensibles
        let ipEncriptada, fingerprintEncriptado, userAgentEncriptado, dispositivoEncriptado;
        try {
            ipEncriptada = encrypt(ip) || ip;
            fingerprintEncriptado = encrypt(fingerprint) || fingerprint;
            userAgentEncriptado = encrypt(userAgent) || userAgent;
            dispositivoEncriptado = encrypt(JSON.stringify(deviceInfo)) || JSON.stringify(deviceInfo);
        } catch (encError) {
            console.error('Error en encriptación, usando texto plano:', encError);
            ipEncriptada = ip;
            fingerprintEncriptado = fingerprint;
            userAgentEncriptado = userAgent;
            dispositivoEncriptado = JSON.stringify(deviceInfo);
        }
        
        // ============================================
        // 🔒 BLOQUEO POR HUELLA DIGITAL
        // ============================================
        // Verificar si este dispositivo ya tiene una cuenta
        const dispositivoExistente = await db.get(
            'SELECT id, username, fecha_registro FROM usuarios WHERE fingerprint = ?',
            [fingerprintEncriptado]
        );
        
        if (dispositivoExistente) {
            console.log('🚫 Intento de múltiples cuentas desde mismo dispositivo');
            console.log('   Usuario existente:', dispositivoExistente.username);
            console.log('   Fecha registro:', dispositivoExistente.fecha_registro);
            
            return res.status(403).json({ 
                error: 'Este dispositivo ya tiene una cuenta. Solo se permite una cuenta por dispositivo.',
                usuario_existente: dispositivoExistente.username,
                fecha_registro: dispositivoExistente.fecha_registro
            });
        }
        // ============================================
        
        // Generar código de invitación
        const codigoNuevo = Math.random().toString(36).substring(2, 10);
        
        // Verificar si hay código de invitación
        let invitadoPor = null;
        if (codigoInvitacion) {
            const invitador = await db.get('SELECT id FROM usuarios WHERE codigo_invitacion = ?', [codigoInvitacion]);
            if (invitador) {
                invitadoPor = invitador.id;
                try {
                    await agregarCreditos(invitador.id, config.CREDITS_POR_INVITACION, 'invitacion', 'Invitó a un usuario');
                } catch (err) {
                    console.error('Error dando créditos al invitador:', err);
                }
            }
        }
        
        // Crear usuario
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
        
        console.log('✅ Usuario creado con ID:', result.lastID);
        console.log('   Fingerprint guardado:', fingerprintEncriptado.substring(0, 20) + '...');
        
        // Generar token
        const token = generateToken(result.lastID);
        
        // Guardar sesión
        await db.run(`
            INSERT INTO sesiones (usuario_id, token, ip, user_agent)
            VALUES (?, ?, ?, ?)
        `, [result.lastID, token, ipEncriptada, userAgentEncriptado]);
        
        logger.info(`Nuevo usuario registrado: ${username}`, { userId: result.lastID, ip });
        
        res.json({
            success: true,
            token,
            user: {
                id: result.lastID,
                username,
                rol: 'user',
                creditos: config.CREDITS_REGISTRO_INICIAL || 3,
                codigo_invitacion: codigoNuevo
            }
        });
        
    } catch (error) {
        console.error('❌ Error detallado en registro:', error);
        logger.error('Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar usuario: ' + error.message });
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
        
        console.log('=== INTENTO LOGIN ADMIN ===');
        console.log('Usuario:', username);
        
        const admin = await db.get('SELECT * FROM usuarios WHERE username = ? AND rol = ?', [username, 'admin']);
        
        if (!admin) {
            console.log('Admin no encontrado');
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        console.log('Admin encontrado, verificando contraseña...');
        
        const validPassword = await bcrypt.compare(password, admin.password_hash);
        
        if (!validPassword) {
            console.log('Contraseña incorrecta');
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        console.log('Login admin exitoso');
        
        const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ userId: admin.id }, config.JWT_SECRET, { expiresIn: '24h' });
        
        await db.run(`
            INSERT INTO sesiones (usuario_id, token, ip, user_agent)
            VALUES (?, ?, ?, ?)
        `, [admin.id, token, ip, userAgent]);
        
        logger.info(`Admin login: ${username}`, { adminId: admin.id, ip });
        
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
        logger.error('Error en login admin:', error);
        res.status(500).json({ error: 'Error al iniciar sesión: ' + error.message });
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
        
        const session = await db.get(
            'SELECT * FROM sesiones WHERE token = ? AND activa = 1',
            [token]
        );
        
        if (!session) {
            return res.status(401).json({ valid: false });
        }
        
        const user = await db.get(
            'SELECT id, username, rol, creditos, esta_bloqueado FROM usuarios WHERE id = ?',
            [decoded.userId]
        );
        
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
        await db.run('UPDATE sesiones SET activa = 0, fecha_fin = ? WHERE token = ?', [
            new Date().toISOString(),
            token
        ]);
    }
    
    res.json({ success: true });
});

module.exports = router;