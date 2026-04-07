const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { getDb, isPostgreSQL } = require('../database/db');
const { decrypt } = require('../crypto/aes');
const { logAdminAction, checkAdminIpWhitelist } = require('../middleware/adminOnly');
const { agregarCreditos, gastarCreditos } = require('../services/creditos');
const { agregarPalabraProhibida, eliminarPalabraProhibida } = require('../utils/profanity');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken);
router.use(verifyAdmin);

// Dashboard - Estadísticas generales
router.get('/dashboard', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let totalUsuarios = 0, usuariosHoy = 0, totalMensajes = 0, mensajesHoy = 0;
        let totalPosts = 0, totalComentarios = 0, usuariosBloqueados = 0, creditosTotales = 0, usuariosActivos = 0;
        
        if (isPG) {
            const r1 = await db.query('SELECT COUNT(*) as count FROM usuarios WHERE rol = $1', ['user']);
            totalUsuarios = parseInt(r1.rows[0].count);
            
            const r2 = await db.query("SELECT COUNT(*) as count FROM usuarios WHERE DATE(fecha_registro) = CURRENT_DATE");
            usuariosHoy = parseInt(r2.rows[0].count);
            
            const r3 = await db.query('SELECT COUNT(*) as count FROM mensajes_chat');
            totalMensajes = parseInt(r3.rows[0].count);
            
            const r4 = await db.query("SELECT COUNT(*) as count FROM mensajes_chat WHERE DATE(fecha_envio) = CURRENT_DATE");
            mensajesHoy = parseInt(r4.rows[0].count);
            
            const r5 = await db.query('SELECT COUNT(*) as count FROM posts_foro');
            totalPosts = parseInt(r5.rows[0].count);
            
            const r6 = await db.query('SELECT COUNT(*) as count FROM comentarios_foro');
            totalComentarios = parseInt(r6.rows[0].count);
            
            const r7 = await db.query('SELECT COUNT(*) as count FROM usuarios WHERE esta_bloqueado = true');
            usuariosBloqueados = parseInt(r7.rows[0].count);
            
            const r8 = await db.query('SELECT SUM(creditos) as total FROM usuarios');
            creditosTotales = r8.rows[0].total || 0;
            
            const r9 = await db.query("SELECT COUNT(DISTINCT usuario_id) as count FROM mensajes_chat WHERE fecha_envio > NOW() - INTERVAL '1 day'");
            usuariosActivos = parseInt(r9.rows[0].count);
        } else {
            const r1 = await db.get('SELECT COUNT(*) as count FROM usuarios WHERE rol = ?', ['user']);
            totalUsuarios = r1.count;
            
            const r2 = await db.get("SELECT COUNT(*) as count FROM usuarios WHERE date(fecha_registro) = date('now')");
            usuariosHoy = r2.count;
            
            const r3 = await db.get('SELECT COUNT(*) as count FROM mensajes_chat');
            totalMensajes = r3.count;
            
            const r4 = await db.get("SELECT COUNT(*) as count FROM mensajes_chat WHERE date(fecha_envio) = date('now')");
            mensajesHoy = r4.count;
            
            const r5 = await db.get('SELECT COUNT(*) as count FROM posts_foro');
            totalPosts = r5.count;
            
            const r6 = await db.get('SELECT COUNT(*) as count FROM comentarios_foro');
            totalComentarios = r6.count;
            
            const r7 = await db.get('SELECT COUNT(*) as count FROM usuarios WHERE esta_bloqueado = 1');
            usuariosBloqueados = r7.count;
            
            const r8 = await db.get('SELECT SUM(creditos) as total FROM usuarios');
            creditosTotales = r8.total || 0;
            
            const r9 = await db.get("SELECT COUNT(DISTINCT usuario_id) as count FROM mensajes_chat WHERE fecha_envio > datetime('now', '-1 day')");
            usuariosActivos = r9.count;
        }
        
        res.json({
            total_usuarios: totalUsuarios,
            usuarios_hoy: usuariosHoy,
            total_mensajes: totalMensajes,
            mensajes_hoy: mensajesHoy,
            total_posts: totalPosts,
            total_comentarios: totalComentarios,
            usuarios_bloqueados: usuariosBloqueados,
            creditos_totales: creditosTotales,
            usuarios_activos: usuariosActivos
        });
        
    } catch (error) {
        logger.error('Error obteniendo dashboard:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Listar usuarios (con datos sensibles desencriptados)
router.get('/usuarios', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        
        let usuarios;
        let total;
        
        if (isPG) {
            const result = await db.query(`
                SELECT id, username, username_original, rol, creditos, fecha_registro,
                       ultimo_acceso, esta_bloqueado, razon_bloqueo, cambio_nombre_count,
                       ip_registro, ip_actual, user_agent, fingerprint, pais, ciudad, dispositivo
                FROM usuarios
                ORDER BY fecha_registro DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            usuarios = result.rows;
            
            const countResult = await db.query('SELECT COUNT(*) as count FROM usuarios');
            total = countResult.rows[0].count;
        } else {
            usuarios = await db.all(`
                SELECT id, username, username_original, rol, creditos, fecha_registro,
                       ultimo_acceso, esta_bloqueado, razon_bloqueo, cambio_nombre_count,
                       ip_registro, ip_actual, user_agent, fingerprint, pais, ciudad, dispositivo
                FROM usuarios
                ORDER BY fecha_registro DESC
                LIMIT ? OFFSET ?
            `, [limit, offset]);
            
            const countResult = await db.get('SELECT COUNT(*) as count FROM usuarios');
            total = countResult.count;
        }
        
        // Función auxiliar para desencriptar
        const desencriptarDato = (dato) => {
            if (!dato) return null;
            try {
                return decrypt(dato);
            } catch(e) {
                return dato;
            }
        };
        
        const usuariosConDatos = usuarios.map(user => ({
            ...user,
            ip_registro: user.ip_registro ? desencriptarDato(user.ip_registro) : null,
            ip_actual: user.ip_actual ? desencriptarDato(user.ip_actual) : null,
            user_agent: user.user_agent ? desencriptarDato(user.user_agent) : null,
            dispositivo: user.dispositivo ? (() => {
                try {
                    const decrypted = desencriptarDato(user.dispositivo);
                    return JSON.parse(decrypted || '{}');
                } catch(e) {
                    return {};
                }
            })() : null
        }));
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'ver_lista_usuarios', null, `Vio lista de usuarios (página ${page})`, ip);
        
        res.json({
            usuarios: usuariosConDatos,
            pagination: {
                page,
                limit,
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        logger.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// Obtener detalles de un usuario específico
router.get('/usuario/:id', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        const userId = req.params.id;
        
        let user;
        if (isPG) {
            const result = await db.query('SELECT * FROM usuarios WHERE id = $1', [userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT * FROM usuarios WHERE id = ?', [userId]);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const desencriptarDato = (dato) => {
            if (!dato) return null;
            try {
                return decrypt(dato);
            } catch(e) {
                return dato;
            }
        };
        
        const userDecrypted = {
            ...user,
            ip_registro: user.ip_registro ? desencriptarDato(user.ip_registro) : null,
            ip_actual: user.ip_actual ? desencriptarDato(user.ip_actual) : null,
            user_agent: user.user_agent ? desencriptarDato(user.user_agent) : null,
            dispositivo: user.dispositivo ? (() => {
                try {
                    const decrypted = desencriptarDato(user.dispositivo);
                    return JSON.parse(decrypted || '{}');
                } catch(e) {
                    return {};
                }
            })() : null
        };
        
        let mensajes, posts, cambiosNombre, transacciones;
        
        if (isPG) {
            const mResult = await db.query(`
                SELECT id, contenido, fecha_envio, ip_origen
                FROM mensajes_chat
                WHERE usuario_id = $1
                ORDER BY fecha_envio DESC LIMIT 50
            `, [userId]);
            mensajes = mResult.rows;
            
            const pResult = await db.query(`
                SELECT id, titulo, contenido, fecha_creacion, ip_origen
                FROM posts_foro
                WHERE usuario_id = $1
                ORDER BY fecha_creacion DESC LIMIT 20
            `, [userId]);
            posts = pResult.rows;
            
            const cResult = await db.query(`
                SELECT * FROM historial_nombres
                WHERE usuario_id = $1
                ORDER BY fecha_cambio DESC
            `, [userId]);
            cambiosNombre = cResult.rows;
            
            const tResult = await db.query(`
                SELECT * FROM transacciones_creditos
                WHERE usuario_id = $1
                ORDER BY fecha DESC LIMIT 50
            `, [userId]);
            transacciones = tResult.rows;
        } else {
            mensajes = await db.all(`
                SELECT id, contenido, fecha_envio, ip_origen
                FROM mensajes_chat
                WHERE usuario_id = ?
                ORDER BY fecha_envio DESC LIMIT 50
            `, [userId]);
            
            posts = await db.all(`
                SELECT id, titulo, contenido, fecha_creacion, ip_origen
                FROM posts_foro
                WHERE usuario_id = ?
                ORDER BY fecha_creacion DESC LIMIT 20
            `, [userId]);
            
            cambiosNombre = await db.all(`
                SELECT * FROM historial_nombres
                WHERE usuario_id = ?
                ORDER BY fecha_cambio DESC
            `, [userId]);
            
            transacciones = await db.all(`
                SELECT * FROM transacciones_creditos
                WHERE usuario_id = ?
                ORDER BY fecha DESC LIMIT 50
            `, [userId]);
        }
        
        const mensajesDecrypted = mensajes.map(m => ({
            ...m,
            ip_origen: m.ip_origen ? desencriptarDato(m.ip_origen) : null
        }));
        
        const postsDecrypted = posts.map(p => ({
            ...p,
            ip_origen: p.ip_origen ? desencriptarDato(p.ip_origen) : null
        }));
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'ver_detalle_usuario', userId, `Vio detalles del usuario ${user.username}`, ip);
        
        res.json({
            usuario: userDecrypted,
            mensajes: mensajesDecrypted,
            posts: postsDecrypted,
            cambios_nombre: cambiosNombre,
            transacciones
        });
        
    } catch (error) {
        logger.error('Error obteniendo detalles de usuario:', error);
        res.status(500).json({ error: 'Error al obtener detalles del usuario' });
    }
});

// Bloquear usuario
router.post('/usuario/:id/bloquear', async (req, res) => {
    try {
        const { razon, dias } = req.body;
        const userId = req.params.id;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let user;
        if (isPG) {
            const result = await db.query('SELECT id, username, esta_bloqueado, rol FROM usuarios WHERE id = $1', [userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username, esta_bloqueado, rol FROM usuarios WHERE id = ?', [userId]);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (user.rol === 'admin') {
            return res.status(403).json({ error: 'No se puede bloquear al administrador' });
        }
        
        let bloqueadoHasta = null;
        if (dias) {
            bloqueadoHasta = new Date();
            bloqueadoHasta.setDate(bloqueadoHasta.getDate() + dias);
        }
        
        if (isPG) {
            await db.query(`
                UPDATE usuarios 
                SET esta_bloqueado = true, razon_bloqueo = $1, bloqueado_hasta = $2
                WHERE id = $3
            `, [razon || 'Sin especificar', bloqueadoHasta, userId]);
            
            await db.query('UPDATE sesiones SET activa = false WHERE usuario_id = $1', [userId]);
        } else {
            await db.run(`
                UPDATE usuarios 
                SET esta_bloqueado = 1, razon_bloqueo = ?, bloqueado_hasta = ?
                WHERE id = ?
            `, [razon || 'Sin especificar', bloqueadoHasta, userId]);
            
            await db.run('UPDATE sesiones SET activa = 0 WHERE usuario_id = ?', [userId]);
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'bloquear_usuario', userId, `Bloqueado: ${razon} por ${dias || 'indefinido'} días`, ip);
        
        logger.info(`Usuario bloqueado: ${user.username} por ${req.user.username}`, { adminId: req.user.id, userId });
        
        res.json({ success: true, mensaje: `Usuario ${user.username} bloqueado` });
        
    } catch (error) {
        logger.error('Error bloqueando usuario:', error);
        res.status(500).json({ error: 'Error al bloquear usuario' });
    }
});

// Desbloquear usuario
router.post('/usuario/:id/desbloquear', async (req, res) => {
    try {
        const userId = req.params.id;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let user;
        if (isPG) {
            const result = await db.query('SELECT id, username FROM usuarios WHERE id = $1', [userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username FROM usuarios WHERE id = ?', [userId]);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (isPG) {
            await db.query(`
                UPDATE usuarios 
                SET esta_bloqueado = false, razon_bloqueo = NULL, bloqueado_hasta = NULL
                WHERE id = $1
            `, [userId]);
        } else {
            await db.run(`
                UPDATE usuarios 
                SET esta_bloqueado = 0, razon_bloqueo = NULL, bloqueado_hasta = NULL
                WHERE id = ?
            `, [userId]);
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'desbloquear_usuario', userId, `Desbloqueado`, ip);
        
        logger.info(`Usuario desbloqueado: ${user.username} por ${req.user.username}`, { adminId: req.user.id, userId });
        
        res.json({ success: true, mensaje: `Usuario ${user.username} desbloqueado` });
        
    } catch (error) {
        logger.error('Error desbloqueando usuario:', error);
        res.status(500).json({ error: 'Error al desbloquear usuario' });
    }
});

// Modificar créditos de usuario
router.post('/usuario/:id/creditos', async (req, res) => {
    try {
        const { cantidad, motivo } = req.body;
        const userId = req.params.id;
        
        if (!cantidad || cantidad === 0) {
            return res.status(400).json({ error: 'Cantidad inválida' });
        }
        
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let user;
        if (isPG) {
            const result = await db.query('SELECT id, username FROM usuarios WHERE id = $1', [userId]);
            user = result.rows[0];
        } else {
            user = await db.get('SELECT id, username FROM usuarios WHERE id = ?', [userId]);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        let resultado;
        if (cantidad > 0) {
            resultado = await agregarCreditos(userId, cantidad, 'ajuste_admin', motivo || 'Ajuste por administrador');
        } else {
            resultado = await gastarCreditos(userId, Math.abs(cantidad), 'ajuste_admin', motivo || 'Ajuste por administrador');
        }
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error });
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'modificar_creditos', userId, `${cantidad > 0 ? 'Agregó' : 'Quitó'} ${Math.abs(cantidad)} créditos. Motivo: ${motivo || 'N/A'}`, ip);
        
        logger.info(`Créditos modificados para ${user.username}: ${cantidad}`, { adminId: req.user.id, userId });
        
        res.json({ success: true, creditos: resultado.creditos });
        
    } catch (error) {
        logger.error('Error modificando créditos:', error);
        res.status(500).json({ error: 'Error al modificar créditos' });
    }
});

// Eliminar mensaje
router.delete('/mensaje/:id', async (req, res) => {
    try {
        const mensajeId = req.params.id;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let mensaje;
        if (isPG) {
            const result = await db.query(`
                SELECT m.*, u.username 
                FROM mensajes_chat m
                JOIN usuarios u ON m.usuario_id = u.id
                WHERE m.id = $1
            `, [mensajeId]);
            mensaje = result.rows[0];
        } else {
            mensaje = await db.get(`
                SELECT m.*, u.username 
                FROM mensajes_chat m
                JOIN usuarios u ON m.usuario_id = u.id
                WHERE m.id = ?
            `, [mensajeId]);
        }
        
        if (!mensaje) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }
        
        if (isPG) {
            await db.query('DELETE FROM mensajes_chat WHERE id = $1', [mensajeId]);
        } else {
            await db.run('DELETE FROM mensajes_chat WHERE id = ?', [mensajeId]);
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'eliminar_mensaje', mensaje.usuario_id, `Mensaje ID ${mensajeId} de ${mensaje.username}: "${mensaje.contenido?.substring(0, 100)}"`, ip);
        
        const io = require('../services/websocket').getIO();
        if (io) {
            io.to('chat-general').emit('mensaje_eliminado', { mensajeId });
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error eliminando mensaje:', error);
        res.status(500).json({ error: 'Error al eliminar mensaje' });
    }
});

// Eliminar post
router.delete('/post/:id', async (req, res) => {
    try {
        const postId = req.params.id;
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let post;
        if (isPG) {
            const result = await db.query(`
                SELECT p.*, u.username 
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.id = $1
            `, [postId]);
            post = result.rows[0];
        } else {
            post = await db.get(`
                SELECT p.*, u.username 
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.id = ?
            `, [postId]);
        }
        
        if (!post) {
            return res.status(404).json({ error: 'Post no encontrado' });
        }
        
        if (isPG) {
            await db.query('DELETE FROM comentarios_foro WHERE post_id = $1', [postId]);
            await db.query('DELETE FROM posts_foro WHERE id = $1', [postId]);
        } else {
            await db.run('DELETE FROM comentarios_foro WHERE post_id = ?', [postId]);
            await db.run('DELETE FROM posts_foro WHERE id = ?', [postId]);
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'eliminar_post', post.usuario_id, `Post ID ${postId} de ${post.username}: "${post.titulo}"`, ip);
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error eliminando post:', error);
        res.status(500).json({ error: 'Error al eliminar post' });
    }
});

// Gestionar palabras prohibidas
router.get('/palabras-prohibidas', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        
        let palabras;
        if (isPG) {
            const result = await db.query('SELECT * FROM palabras_prohibidas ORDER BY palabra');
            palabras = result.rows;
        } else {
            palabras = await db.all('SELECT * FROM palabras_prohibidas ORDER BY palabra');
        }
        
        res.json(palabras);
        
    } catch (error) {
        logger.error('Error obteniendo palabras prohibidas:', error);
        res.status(500).json({ error: 'Error al obtener palabras' });
    }
});

router.post('/palabras-prohibidas', async (req, res) => {
    try {
        const { palabra, severidad } = req.body;
        
        if (!palabra || palabra.length < 2) {
            return res.status(400).json({ error: 'Palabra inválida' });
        }
        
        const result = await agregarPalabraProhibida(palabra, severidad || 1);
        
        if (!result) {
            return res.status(400).json({ error: 'La palabra ya existe' });
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'agregar_palabra', null, `Agregó palabra prohibida: ${palabra}`, ip);
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error agregando palabra prohibida:', error);
        res.status(500).json({ error: 'Error al agregar palabra' });
    }
});

router.delete('/palabras-prohibidas/:palabra', async (req, res) => {
    try {
        const { palabra } = req.params;
        
        await eliminarPalabraProhibida(palabra);
        
        const ip = req.ip || req.connection.remoteAddress;
        await logAdminAction(req.user.id, 'eliminar_palabra', null, `Eliminó palabra prohibida: ${palabra}`, ip);
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error eliminando palabra prohibida:', error);
        res.status(500).json({ error: 'Error al eliminar palabra' });
    }
});

// Auditoría
router.get('/auditoria', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        
        let logs;
        let total;
        
        if (isPG) {
            const result = await db.query(`
                SELECT a.*, u.username as admin_nombre
                FROM auditoria_admin a
                LEFT JOIN usuarios u ON a.admin_id = u.id
                ORDER BY a.fecha DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            logs = result.rows;
            
            const countResult = await db.query('SELECT COUNT(*) as count FROM auditoria_admin');
            total = countResult.rows[0].count;
        } else {
            logs = await db.all(`
                SELECT a.*, u.username as admin_nombre
                FROM auditoria_admin a
                LEFT JOIN usuarios u ON a.admin_id = u.id
                ORDER BY a.fecha DESC
                LIMIT ? OFFSET ?
            `, [limit, offset]);
            
            const countResult = await db.get('SELECT COUNT(*) as count FROM auditoria_admin');
            total = countResult.count;
        }
        
        res.json({
            logs,
            pagination: {
                page,
                limit,
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        logger.error('Error obteniendo auditoría:', error);
        res.status(500).json({ error: 'Error al obtener auditoría' });
    }
});

module.exports = router;