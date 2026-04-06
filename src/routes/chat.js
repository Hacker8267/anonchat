const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { filtrarInsultos } = require('../utils/profanity');
const { getIO } = require('../services/websocket');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken);

// Obtener mensajes recientes
router.get('/mensajes', async (req, res) => {
    try {
        const db = getDb();
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        
        const mensajes = await db.all(`
            SELECT m.id, m.usuario_id, m.nombre_mostrado, m.contenido, 
                   m.fecha_envio, m.destacado
            FROM mensajes_chat m
            JOIN usuarios u ON m.usuario_id = u.id
            WHERE u.esta_bloqueado = 0
            ORDER BY m.fecha_envio DESC LIMIT ?
        `, [limit]);
        
        res.json(mensajes.reverse());
        
    } catch (error) {
        logger.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

// Enviar mensaje (alternativa REST)
router.post('/mensaje', async (req, res) => {
    try {
        const { contenido } = req.body;
        
        if (!contenido || contenido.length < 1 || contenido.length > 500) {
            return res.status(400).json({ error: 'Mensaje inválido' });
        }
        
        const contenidoFiltrado = await filtrarInsultos(contenido);
        const db = getDb();
        const ip = req.ip || req.connection.remoteAddress;
        
        const result = await db.run(`
            INSERT INTO mensajes_chat (usuario_id, nombre_mostrado, contenido, ip_origen)
            VALUES (?, ?, ?, ?)
        `, [req.user.id, req.user.username, contenidoFiltrado, ip]);
        
        const nuevoMensaje = {
            id: result.lastID,
            usuario_id: req.user.id,
            nombre_mostrado: req.user.username,
            contenido: contenidoFiltrado,
            fecha_envio: new Date().toISOString(),
            destacado: 0
        };
        
        // Emitir via WebSocket si está disponible
        const io = getIO();
        if (io) {
            io.to('chat-general').emit('mensaje_recibido', nuevoMensaje);
        }
        
        logger.info(`Nuevo mensaje de ${req.user.username}`, { userId: req.user.id, mensajeId: result.lastID });
        
        res.json(nuevoMensaje);
        
    } catch (error) {
        logger.error('Error enviando mensaje:', error);
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
});

// Destacar mensaje (requiere créditos)
router.post('/destacar/:mensajeId', async (req, res) => {
    try {
        const db = getDb();
        const { mensajeId } = req.params;
        
        const mensaje = await db.get('SELECT id, destacado FROM mensajes_chat WHERE id = ?', [mensajeId]);
        
        if (!mensaje) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }
        
        if (mensaje.destacado) {
            return res.status(400).json({ error: 'El mensaje ya está destacado' });
        }
        
        const { gastarCreditos } = require('../services/creditos');
        const result = await gastarCreditos(req.user.id, 2, 'gasto', 'Destacar mensaje');
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        await db.run('UPDATE mensajes_chat SET destacado = 1 WHERE id = ?', [mensajeId]);
        
        const io = getIO();
        if (io) {
            io.to('chat-general').emit('mensaje_destacado', { mensajeId, usuarioId: req.user.id });
        }
        
        res.json({ success: true, creditos_restantes: result.creditos });
        
    } catch (error) {
        logger.error('Error destacando mensaje:', error);
        res.status(500).json({ error: 'Error al destacar mensaje' });
    }
});

module.exports = router;