const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { initializeDatabase } = require('./database/db');
const { loadKeys } = require('./crypto/rsa');
const { securityHeaders, corsOptions, limiter } = require('./middleware/security');
const { setupWebSocket } = require('./services/websocket');
const config = require('./config/env');
const logger = require('./utils/logger');

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

// Ruta admin login
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/login.html'));
});

// Ruta admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/admin.html'));
});

// Ruta chat
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/chat.html'));
});

// Ruta foro
app.get('/foro', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/foro.html'));
});

// Ruta tienda
app.get('/tienda', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/tienda.html'));
});

// Ruta perfil
app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/perfil.html'));
});

// Manejo de errores 404
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    logger.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
async function startServer() {
    try {
        // Inicializar base de datos
        await initializeDatabase();
        
        // Cargar claves RSA
        loadKeys();
        
        // Configurar WebSocket
        setupWebSocket(server);
        
        // Iniciar servidor
        server.listen(config.PORT, () => {
            logger.info(`🚀 Servidor iniciado en http://localhost:${config.PORT}`);
            logger.info(`📱 Modo: ${config.NODE_ENV}`);
            logger.info(`🔐 Seguridad: RSA-2048 + AES-256-GCM`);
            logger.info(`💳 Pagos: ${config.MERCADOPAGO_ACCESS_TOKEN ? 'MercadoPago ✓' : 'MercadoPago ✗'} | ${config.PAYPAL_CLIENT_ID ? 'PayPal ✓' : 'PayPal ✗'}`);
        });
        
    } catch (error) {
        logger.error('Error iniciando servidor:', error);
        process.exit(1);
    }
}

startServer();

module.exports = { app, server };