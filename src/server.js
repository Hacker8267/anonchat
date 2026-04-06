const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { initializeDatabase, getDb, isPostgreSQL } = require('./database/db');
const { loadKeys } = require('./crypto/rsa');
const { securityHeaders, corsOptions, limiter } = require('./middleware/security');
const { setupWebSocket } = require('./services/websocket');
const config = require('./config/env');
const logger = require('./utils/logger');
const bcrypt = require('bcryptjs');

// Importar rutas
const authRoutes = require('./routes/auth');
const usuarioRoutes = require('./routes/usuario');
const chatRoutes = require('./routes/chat');
const foroRoutes = require('./routes/foro');
const adminRoutes = require('./routes/admin');
const tiendaRoutes = require('./routes/tienda');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(compression());
app.use(securityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/foro', foroRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tienda', tiendaRoutes);

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/admin.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/chat.html'));
});

app.get('/foro', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/foro.html'));
});

app.get('/tienda', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/tienda.html'));
});

app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/perfil.html'));
});

app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
    logger.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// 🔐 CREAR ADMIN AUTOMÁTICAMENTE SI NO EXISTE
// ============================================
async function crearAdminSiNoExiste() {
    const db = getDb();
    const isPG = isPostgreSQL();
    let admin;
    
    try {
        if (isPG) {
            const result = await db.query('SELECT id FROM usuarios WHERE rol = $1', ['admin']);
            admin = result.rows[0];
        } else {
            admin = await db.get('SELECT id FROM usuarios WHERE rol = ?', ['admin']);
        }
        
        if (!admin) {
            const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123Seguro!';
            const hash = bcrypt.hashSync(adminPassword, 10);
            
            if (isPG) {
                await db.query(`
                    INSERT INTO usuarios (username, password_hash, rol, creditos, fecha_registro)
                    VALUES ($1, $2, $3, $4, $5)
                `, ['admin', hash, 'admin', 999999, new Date().toISOString()]);
            } else {
                await db.run(`
                    INSERT INTO usuarios (username, password_hash, rol, creditos, fecha_registro)
                    VALUES (?, ?, ?, ?, ?)
                `, ['admin', hash, 'admin', 999999, new Date().toISOString()]);
            }
            
            console.log('✅ Usuario admin creado automáticamente');
            console.log('   Usuario: admin');
            console.log('   Contraseña: ' + adminPassword);
        } else {
            console.log('✅ Usuario admin ya existe');
        }
    } catch (error) {
        console.error('Error creando admin:', error);
    }
}
// ============================================

// Iniciar servidor
async function startServer() {
    try {
        await initializeDatabase();
        await crearAdminSiNoExiste();
        loadKeys();
        setupWebSocket(server);
        
        server.listen(config.PORT, () => {
            logger.info(`🚀 Servidor iniciado en http://localhost:${config.PORT}`);
            logger.info(`📱 Modo: ${config.NODE_ENV}`);
            logger.info(`🔐 Seguridad: RSA-2048 + AES-256-GCM`);
        });
        
    } catch (error) {
        logger.error('Error iniciando servidor:', error);
        process.exit(1);
    }
}

startServer();

module.exports = { app, server };