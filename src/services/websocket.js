const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { getDb, isPostgreSQL } = require('../database/db');

let io = null;

function setupWebSocket(server) {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
    
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Token no proporcionado'));
            }
            
            const decoded = jwt.verify(token, config.JWT_SECRET);
            const db = getDb();
            const isPG = isPostgreSQL();
            
            let user = null;
            if (isPG) {
                const result = await db.query(
                    'SELECT id, username, rol, esta_bloqueado FROM usuarios WHERE id = $1',
                    [decoded.userId]
                );
                user = result.rows[0];
            } else {
                user = await db.get(
                    'SELECT id, username, rol, esta_bloqueado FROM usuarios WHERE id = ?',
                    [decoded.userId]
                );
            }
            
            if (!user || user.esta_bloqueado) {
                return next(new Error('Usuario bloqueado'));
            }
            
            socket.user = user;
            next();
        } catch (error) {
            console.error('Error en autenticación WebSocket:', error);
            next(new Error('Token inválido'));
        }
    });
    
    io.on('connection', async (socket) => {
        console.log(`Usuario conectado: ${socket.user.username}`);
        
        socket.join('chat-general');
        
        const db = getDb();
        const isPG = isPostgreSQL();
        
        try {
            let mensajesRecientes;
            if (isPG) {
                const result = await db.query(`
                    SELECT m.id, m.usuario_id, m.nombre_mostrado, m.contenido, m.fecha_envio
                    FROM mensajes_chat m
                    JOIN usuarios u ON m.usuario_id = u.id
                    WHERE u.esta_bloqueado = false
                    ORDER BY m.fecha_envio DESC LIMIT 50
                `);
                mensajesRecientes = result.rows;
            } else {
                mensajesRecientes = await db.all(`
                    SELECT m.id, m.usuario_id, m.nombre_mostrado, m.contenido, m.fecha_envio
                    FROM mensajes_chat m
                    JOIN usuarios u ON m.usuario_id = u.id
                    WHERE u.esta_bloqueado = 0
                    ORDER BY m.fecha_envio DESC LIMIT 50
                `);
            }
            
            socket.emit('mensajes_historial', mensajesRecientes.reverse());
        } catch (err) {
            console.error('Error cargando historial:', err);
        }
        
        socket.on('nuevo_mensaje', async (data) => {
            try {
                if (!data.contenido || data.contenido.length > 500) {
                    return;
                }
                
                console.log(`Nuevo mensaje de ${socket.user.username}: ${data.contenido}`);
                
                let mensajeId;
                if (isPG) {
                    const result = await db.query(`
                        INSERT INTO mensajes_chat (usuario_id, nombre_mostrado, contenido)
                        VALUES ($1, $2, $3)
                        RETURNING id
                    `, [socket.user.id, socket.user.username, data.contenido]);
                    mensajeId = result.rows[0].id;
                } else {
                    const result = await db.run(`
                        INSERT INTO mensajes_chat (usuario_id, nombre_mostrado, contenido)
                        VALUES (?, ?, ?)
                    `, [socket.user.id, socket.user.username, data.contenido]);
                    mensajeId = result.lastID;
                }
                
                const nuevoMensaje = {
                    id: mensajeId,
                    usuario_id: socket.user.id,
                    nombre_mostrado: socket.user.username,
                    contenido: data.contenido,
                    fecha_envio: new Date().toISOString()
                };
                
                io.to('chat-general').emit('mensaje_recibido', nuevoMensaje);
            } catch (error) {
                console.error('Error al enviar mensaje:', error);
                socket.emit('error', { message: 'Error al enviar mensaje' });
            }
        });
        
        socket.on('disconnect', () => {
            console.log(`Usuario desconectado: ${socket.user.username}`);
        });
    });
    
    return io;
}

function getIO() {
    return io;
}

module.exports = {
    setupWebSocket,
    getIO
};