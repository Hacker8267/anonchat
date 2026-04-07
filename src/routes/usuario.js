const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getDb, isPostgreSQL } = require('../database/db');
const { gastarCreditos, verificarCreditoDiario } = require('../services/creditos');
const { isUsernameAvailable, isUsernameValid } = require('../utils/validators');
const { filtrarInsultos, contieneInsultos } = require('../utils/profanity');
const { decrypt } = require('../crypto/aes');
const config = require('../config/env');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken);

// Obtener perfil del usuario
router.get('/perfil', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let user;
        if (isPG) {
            const result = await db.query(`
                SELECT id, username, username_original, rol, creditos, 
                       fecha_registro, ultimo_acceso, cambio_nombre_count, 
                       ultimo_cambio_nombre, codigo_invitacion, invitado_por
                FROM usuarios 
                WHERE id = $1
            `, [req.user.id]);
            user = result.rows[0];
        } else {
            user = await db.get(`
                SELECT id, username, username_original, rol, creditos, 
                       fecha_registro, ultimo_acceso, cambio_nombre_count, 
                       ultimo_cambio_nombre, codigo_invitacion, invitado_por
                FROM usuarios 
                WHERE id = ?
            `, [req.user.id]);
        }
        
        let invitadosCount = 0;
        if (isPG) {
            const result = await db.query('SELECT COUNT(*) as count FROM usuarios WHERE invitado_por = $1', [req.user.id]);
            invitadosCount = parseInt(result.rows[0].count);
        } else {
            const result = await db.get('SELECT COUNT(*) as count FROM usuarios WHERE invitado_por = ?', [req.user.id]);
            invitadosCount = result ? result.count : 0;
        }
        
        res.json({
            ...user,
            invitados_count: invitadosCount
        });
        
    } catch (error) {
        logger.error('Error obteniendo perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// Cambiar nombre de usuario
router.post('/cambiar-nombre', async (req, res) => {
    try {
        const { nuevoNombre } = req.body;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        if (!nuevoNombre || nuevoNombre.length < 3 || nuevoNombre.length > 20) {
            return res.status(400).json({ error: 'El nombre debe tener entre 3 y 20 caracteres' });
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(nuevoNombre)) {
            return res.status(400).json({ error: 'El nombre solo puede contener letras, números y guión bajo' });
        }
        
        if (await contieneInsultos(nuevoNombre)) {
            return res.status(400).json({ error: 'El nombre contiene lenguaje ofensivo' });
        }
        
        if (!await isUsernameAvailable(nuevoNombre)) {
            return res.status(400).json({ error: 'Este nombre ya está en uso' });
        }
        
        let user;
        if (isPG) {
            const result = await db.query('SELECT cambio_nombre_count, ultimo_cambio_nombre, username, creditos FROM usuarios WHERE id = $1', [req.user.id]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT cambio_nombre_count, ultimo_cambio_nombre, username, creditos FROM usuarios WHERE id = ?', [req.user.id]);
        }
        
        let costo = config.CAMBIO_NOMBRE_COSTO;
        
        if (user.cambio_nombre_count === 0) {
            costo = 0;
        } else {
            if (user.ultimo_cambio_nombre) {
                const diasDesdeUltimo = (Date.now() - new Date(user.ultimo_cambio_nombre).getTime()) / (1000 * 60 * 60 * 24);
                if (diasDesdeUltimo >= config.CAMBIO_NOMBRE_DIAS_DESCUENTO) {
                    costo = config.CAMBIO_NOMBRE_COSTO_DESCUENTO;
                }
            }
        }
        
        if (costo > 0) {
            const gastoResult = await gastarCreditos(req.user.id, costo, 'gasto', `Cambio de nombre a ${nuevoNombre}`);
            if (!gastoResult.success) {
                return res.status(400).json({ error: gastoResult.error });
            }
        }
        
        if (isPG) {
            await db.query(`
                INSERT INTO historial_nombres (usuario_id, nombre_anterior, nombre_nuevo, creditos_gastados)
                VALUES ($1, $2, $3, $4)
            `, [req.user.id, user.username, nuevoNombre, costo]);
            
            await db.query(`
                UPDATE usuarios 
                SET username = $1, cambio_nombre_count = cambio_nombre_count + 1, ultimo_cambio_nombre = $2
                WHERE id = $3
            `, [nuevoNombre, new Date().toISOString(), req.user.id]);
            
            await db.query(`
                UPDATE mensajes_chat 
                SET nombre_mostrado = $1 
                WHERE usuario_id = $2
            `, [nuevoNombre, req.user.id]);
        } else {
            await db.run(`
                INSERT INTO historial_nombres (usuario_id, nombre_anterior, nombre_nuevo, creditos_gastados)
                VALUES (?, ?, ?, ?)
            `, [req.user.id, user.username, nuevoNombre, costo]);
            
            await db.run(`
                UPDATE usuarios 
                SET username = ?, cambio_nombre_count = cambio_nombre_count + 1, ultimo_cambio_nombre = ?
                WHERE id = ?
            `, [nuevoNombre, new Date().toISOString(), req.user.id]);
            
            await db.run(`
                UPDATE mensajes_chat 
                SET nombre_mostrado = ? 
                WHERE usuario_id = ?
            `, [nuevoNombre, req.user.id]);
        }
        
        logger.info(`Usuario cambió nombre: ${user.username} -> ${nuevoNombre}`, { userId: req.user.id, costo });
        
        res.json({
            success: true,
            nuevo_nombre: nuevoNombre,
            creditos_restantes: user.creditos - (costo > 0 ? costo : 0),
            mensaje: costo === 0 ? 'Primer cambio de nombre gratuito' : `Cambio realizado. Costo: ${costo} créditos`
        });
        
    } catch (error) {
        logger.error('Error cambiando nombre:', error);
        res.status(500).json({ error: 'Error al cambiar nombre' });
    }
});

// Obtener créditos
router.get('/creditos', async (req, res) => {
    try {
        const recibioDiario = await verificarCreditoDiario(req.user.id);
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let creditos;
        if (isPG) {
            const result = await db.query('SELECT creditos FROM usuarios WHERE id = $1', [req.user.id]);
            creditos = result.rows[0]?.creditos || 0;
        } else {
            const user = await db.get('SELECT creditos FROM usuarios WHERE id = ?', [req.user.id]);
            creditos = user?.creditos || 0;
        }
        
        res.json({
            creditos: creditos,
            credito_diario_recibido: recibioDiario
        });
        
    } catch (error) {
        logger.error('Error obteniendo créditos:', error);
        res.status(500).json({ error: 'Error al obtener créditos' });
    }
});

// Historial de créditos
router.get('/historial-creditos', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let historial;
        if (isPG) {
            const result = await db.query(`
                SELECT cantidad, tipo, descripcion, fecha
                FROM transacciones_creditos
                WHERE usuario_id = $1
                ORDER BY fecha DESC LIMIT 50
            `, [req.user.id]);
            historial = result.rows;
        } else {
            historial = await db.all(`
                SELECT cantidad, tipo, descripcion, fecha
                FROM transacciones_creditos
                WHERE usuario_id = ?
                ORDER BY fecha DESC LIMIT 50
            `, [req.user.id]);
        }
        
        res.json(historial);
        
    } catch (error) {
        logger.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// Historial de nombres
router.get('/historial-nombres', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let historial;
        if (isPG) {
            const result = await db.query(`
                SELECT nombre_anterior, nombre_nuevo, creditos_gastados, fecha_cambio
                FROM historial_nombres
                WHERE usuario_id = $1
                ORDER BY fecha_cambio DESC LIMIT 20
            `, [req.user.id]);
            historial = result.rows;
        } else {
            historial = await db.all(`
                SELECT nombre_anterior, nombre_nuevo, creditos_gastados, fecha_cambio
                FROM historial_nombres
                WHERE usuario_id = ?
                ORDER BY fecha_cambio DESC LIMIT 20
            `, [req.user.id]);
        }
        
        res.json(historial);
        
    } catch (error) {
        logger.error('Error obteniendo historial de nombres:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// Obtener estadísticas personales
router.get('/estadisticas', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let mensajesCount = 0, postsCount = 0, comentariosCount = 0, invitadosCount = 0;
        
        if (isPG) {
            const r1 = await db.query('SELECT COUNT(*) as count FROM mensajes_chat WHERE usuario_id = $1', [req.user.id]);
            mensajesCount = parseInt(r1.rows[0].count);
            
            const r2 = await db.query('SELECT COUNT(*) as count FROM posts_foro WHERE usuario_id = $1', [req.user.id]);
            postsCount = parseInt(r2.rows[0].count);
            
            const r3 = await db.query('SELECT COUNT(*) as count FROM comentarios_foro WHERE usuario_id = $1', [req.user.id]);
            comentariosCount = parseInt(r3.rows[0].count);
            
            const r4 = await db.query('SELECT COUNT(*) as count FROM usuarios WHERE invitado_por = $1', [req.user.id]);
            invitadosCount = parseInt(r4.rows[0].count);
        } else {
            const r1 = await db.get('SELECT COUNT(*) as count FROM mensajes_chat WHERE usuario_id = ?', [req.user.id]);
            mensajesCount = r1?.count || 0;
            
            const r2 = await db.get('SELECT COUNT(*) as count FROM posts_foro WHERE usuario_id = ?', [req.user.id]);
            postsCount = r2?.count || 0;
            
            const r3 = await db.get('SELECT COUNT(*) as count FROM comentarios_foro WHERE usuario_id = ?', [req.user.id]);
            comentariosCount = r3?.count || 0;
            
            const r4 = await db.get('SELECT COUNT(*) as count FROM usuarios WHERE invitado_por = ?', [req.user.id]);
            invitadosCount = r4?.count || 0;
        }
        
        res.json({
            mensajes: mensajesCount,
            posts: postsCount,
            comentarios: comentariosCount,
            invitados: invitadosCount
        });
        
    } catch (error) {
        logger.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;