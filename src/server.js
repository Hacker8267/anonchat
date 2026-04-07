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

// Manejo de errores para evitar crashes
process.on('uncaughtException', (err) => {
    console.error('Error no capturado:', err.message);
});

process.on('unhandledRejection', (err) => {
    console.error('Promesa rechazada:', err);
});

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

// ============================================
// ⏰ CONTROL DE HORARIO (5:00 AM - 11:59 PM)
// ============================================
function estaEnHorarioPermitido() {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    
    // Horario permitido: 5:00 AM hasta 23:59 (11:59 PM)
    return horaActual >= 5 && horaActual < 24;
}

// Middleware para verificar horario
app.use((req, res, next) => {
    // Rutas que SIEMPRE están permitidas (admin, archivos estáticos)
    const rutasSiemprePermitidas = [
        '/api/admin',
        '/api/auth/admin-login',
        '/admin-login',
        '/admin',
        '/css/',
        '/js/',
        '/manifest.json',
        '/socket.io/'
    ];
    
    // Verificar si la ruta actual está en las siempre permitidas
    const esRutaPermitida = rutasSiemprePermitidas.some(ruta => req.path.startsWith(ruta));
    
    if (esRutaPermitida) {
        return next(); // Admin siempre puede entrar
    }
    
    // Verificar horario para usuarios normales
    if (!estaEnHorarioPermitido()) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AnonChat - Cerrado</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: #0a0a0a;
                        color: white;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        text-align: center;
                    }
                    .container {
                        background: #1a1a1a;
                        padding: 2rem;
                        border-radius: 16px;
                        max-width: 400px;
                        border: 1px solid #333;
                    }
                    h1 { color: #ffaa44; margin-bottom: 1rem; }
                    p { color: #888; margin-bottom: 1.5rem; line-height: 1.5; }
                    .horario {
                        background: #00ff9d;
                        color: #0a0a0a;
                        padding: 10px;
                        border-radius: 8px;
                        font-weight: bold;
                        margin: 1rem 0;
                    }
                    .reloj {
                        font-size: 2rem;
                        margin: 1rem 0;
                        color: #00ff9d;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🌙 Sitio Cerrado</h1>
                    <div class="reloj" id="reloj"></div>
                    <p>AnonChat solo está disponible en horario diurno.</p>
                    <div class="horario">
                        ⏰ Horario de atención:<br>
                        5:00 AM - 11:59 PM
                    </div>
                    <p>Vuelve pronto. ¡Te esperamos!</p>
                    <p style="font-size: 0.8rem; margin-top: 1rem;">
                        🔐 Los administradores pueden acceder en cualquier momento
                    </p>
                </div>
                <script>
                    function actualizarReloj() {
                        const ahora = new Date();
                        const hora = ahora.getHours().toString().padStart(2,'0');
                        const minutos = ahora.getMinutes().toString().padStart(2,'0');
                        const segundos = ahora.getSeconds().toString().padStart(2,'0');
                        document.getElementById('reloj').textContent = \`\${hora}:\${minutos}:\${segundos}\`;
                    }
                    actualizarReloj();
                    setInterval(actualizarReloj, 1000);
                </script>
            </body>
            </html>
        `);
    }
    
    next();
});
// ============================================

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