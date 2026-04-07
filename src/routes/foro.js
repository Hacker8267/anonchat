const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getDb, isPostgreSQL } = require('../database/db');
const { filtrarInsultos, contieneInsultos } = require('../utils/profanity');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken);

// Obtener posts
router.get('/posts', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;
        
        let posts;
        let total;
        
        if (isPG) {
            const result = await db.query(`
                SELECT p.id, p.usuario_id, p.titulo, p.contenido, p.fecha_creacion, 
                       p.respuestas_count, p.destacado,
                       u.username as autor_nombre
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE u.esta_bloqueado = false
                ORDER BY p.destacado DESC, p.fecha_creacion DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            posts = result.rows;
            
            const countResult = await db.query('SELECT COUNT(*) as count FROM posts_foro');
            total = countResult.rows[0];
        } else {
            posts = await db.all(`
                SELECT p.id, p.usuario_id, p.titulo, p.contenido, p.fecha_creacion, 
                       p.respuestas_count, p.destacado,
                       u.username as autor_nombre
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE u.esta_bloqueado = 0
                ORDER BY p.destacado DESC, p.fecha_creacion DESC
                LIMIT ? OFFSET ?
            `, [limit, offset]);
            
            total = await db.get('SELECT COUNT(*) as count FROM posts_foro');
        }
        
        res.json({
            posts,
            pagination: {
                page,
                limit,
                total: total ? total.count : 0,
                pages: Math.ceil((total ? total.count : 0) / limit)
            }
        });
        
    } catch (error) {
        logger.error('Error obteniendo posts:', error);
        res.status(500).json({ error: 'Error al obtener posts' });
    }
});

// Crear post
router.post('/post', async (req, res) => {
    try {
        const { titulo, contenido } = req.body;
        
        if (!titulo || titulo.length < 3 || titulo.length > 100) {
            return res.status(400).json({ error: 'El título debe tener entre 3 y 100 caracteres' });
        }
        
        if (!contenido || contenido.length < 1 || contenido.length > 5000) {
            return res.status(400).json({ error: 'El contenido debe tener entre 1 y 5000 caracteres' });
        }
        
        if (await contieneInsultos(titulo) || await contieneInsultos(contenido)) {
            return res.status(400).json({ error: 'El post contiene lenguaje ofensivo' });
        }
        
        const tituloFiltrado = await filtrarInsultos(titulo);
        const contenidoFiltrado = await filtrarInsultos(contenido);
        
        const db = getDb();
        const isPG = isPostgreSQL();
        const ip = req.ip || req.connection.remoteAddress;
        
        let postId;
        if (isPG) {
            const result = await db.query(`
                INSERT INTO posts_foro (usuario_id, titulo, contenido, ip_origen)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [req.user.id, tituloFiltrado, contenidoFiltrado, ip]);
            postId = result.rows[0].id;
        } else {
            const result = await db.run(`
                INSERT INTO posts_foro (usuario_id, titulo, contenido, ip_origen)
                VALUES (?, ?, ?, ?)
            `, [req.user.id, tituloFiltrado, contenidoFiltrado, ip]);
            postId = result.lastID;
        }
        
        logger.info(`Nuevo post de ${req.user.username}: ${titulo}`, { userId: req.user.id, postId: postId });
        
        res.json({
            id: postId,
            titulo: tituloFiltrado,
            contenido: contenidoFiltrado,
            fecha_creacion: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Error creando post:', error);
        res.status(500).json({ error: 'Error al crear post' });
    }
});

// Obtener un post con sus comentarios
router.get('/post/:id', async (req, res) => {
    try {
        const db = getDb();
        const isPG = isPostgreSQL();
        const postId = req.params.id;
        
        let post;
        if (isPG) {
            const result = await db.query(`
                SELECT p.*, u.username as autor_nombre
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.id = $1
            `, [postId]);
            post = result.rows[0];
        } else {
            post = await db.get(`
                SELECT p.*, u.username as autor_nombre
                FROM posts_foro p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.id = ?
            `, [postId]);
        }
        
        if (!post) {
            return res.status(404).json({ error: 'Post no encontrado' });
        }
        
        let comentarios;
        if (isPG) {
            const result = await db.query(`
                SELECT c.*, u.username as autor_nombre
                FROM comentarios_foro c
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.post_id = $1
                ORDER BY c.fecha_creacion ASC
            `, [postId]);
            comentarios = result.rows;
        } else {
            comentarios = await db.all(`
                SELECT c.*, u.username as autor_nombre
                FROM comentarios_foro c
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.post_id = ?
                ORDER BY c.fecha_creacion ASC
            `, [postId]);
        }
        
        res.json({ post, comentarios });
        
    } catch (error) {
        logger.error('Error obteniendo post:', error);
        res.status(500).json({ error: 'Error al obtener post' });
    }
});

// Comentar en un post
router.post('/post/:id/comentar', async (req, res) => {
    try {
        const { contenido } = req.body;
        const postId = req.params.id;
        
        if (!contenido || contenido.length < 1 || contenido.length > 1000) {
            return res.status(400).json({ error: 'El comentario debe tener entre 1 y 1000 caracteres' });
        }
        
        if (await contieneInsultos(contenido)) {
            return res.status(400).json({ error: 'El comentario contiene lenguaje ofensivo' });
        }
        
        const contenidoFiltrado = await filtrarInsultos(contenido);
        const db = getDb();
        const isPG = isPostgreSQL();
        const ip = req.ip || req.connection.remoteAddress;
        
        // Verificar que el post existe
        let postExists;
        if (isPG) {
            const result = await db.query('SELECT id FROM posts_foro WHERE id = $1', [postId]);
            postExists = result.rows[0];
        } else {
            postExists = await db.get('SELECT id FROM posts_foro WHERE id = ?', [postId]);
        }
        
        if (!postExists) {
            return res.status(404).json({ error: 'Post no encontrado' });
        }
        
        let comentarioId;
        if (isPG) {
            const result = await db.query(`
                INSERT INTO comentarios_foro (post_id, usuario_id, contenido, ip_origen)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [postId, req.user.id, contenidoFiltrado, ip]);
            comentarioId = result.rows[0].id;
            
            await db.query(`UPDATE posts_foro SET respuestas_count = respuestas_count + 1 WHERE id = $1`, [postId]);
        } else {
            const result = await db.run(`
                INSERT INTO comentarios_foro (post_id, usuario_id, contenido, ip_origen)
                VALUES (?, ?, ?, ?)
            `, [postId, req.user.id, contenidoFiltrado, ip]);
            comentarioId = result.lastID;
            
            await db.run(`UPDATE posts_foro SET respuestas_count = respuestas_count + 1 WHERE id = ?`, [postId]);
        }
        
        logger.info(`Nuevo comentario de ${req.user.username} en post ${postId}`, { userId: req.user.id, comentarioId: comentarioId });
        
        res.json({
            id: comentarioId,
            contenido: contenidoFiltrado,
            fecha_creacion: new Date().toISOString(),
            autor_nombre: req.user.username
        });
        
    } catch (error) {
        logger.error('Error creando comentario:', error);
        res.status(500).json({ error: 'Error al crear comentario' });
    }
});

module.exports = router;