const { Pool } = require('pg');

let pool = null;

async function initializePostgreSQL() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
        console.error('❌ DATABASE_URL no encontrada');
        return null;
    }
    
    pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    
    // Crear tablas en PostgreSQL
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            username_original TEXT,
            password_hash TEXT,
            rol TEXT DEFAULT 'user',
            creditos INTEGER DEFAULT 3,
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ultimo_acceso TIMESTAMP,
            ip_registro TEXT,
            ip_actual TEXT,
            fingerprint TEXT,
            user_agent TEXT,
            pais TEXT,
            ciudad TEXT,
            dispositivo TEXT,
            esta_bloqueado BOOLEAN DEFAULT FALSE,
            bloqueado_hasta TIMESTAMP,
            razon_bloqueo TEXT,
            cambio_nombre_count INTEGER DEFAULT 0,
            ultimo_cambio_nombre TIMESTAMP,
            codigo_invitacion TEXT UNIQUE,
            invitado_por INTEGER,
            ultimo_credito_diario TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS mensajes_chat (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id),
            nombre_mostrado TEXT,
            contenido TEXT,
            fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            destacado BOOLEAN DEFAULT FALSE,
            ip_origen TEXT
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS posts_foro (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id),
            titulo TEXT,
            contenido TEXT,
            imagen_url TEXT,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            respuestas_count INTEGER DEFAULT 0,
            destacado BOOLEAN DEFAULT FALSE,
            reacciones INTEGER DEFAULT 0,
            reacciones_heart INTEGER DEFAULT 0,
            reacciones_like INTEGER DEFAULT 0,
            reacciones_haha INTEGER DEFAULT 0,
            reacciones_wow INTEGER DEFAULT 0,
            reacciones_sad INTEGER DEFAULT 0
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS comentarios_foro (
            id SERIAL PRIMARY KEY,
            post_id INTEGER REFERENCES posts_foro(id),
            usuario_id INTEGER REFERENCES usuarios(id),
            contenido TEXT,
            imagen_url TEXT,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            reacciones INTEGER DEFAULT 0
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sesiones (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id),
            token TEXT UNIQUE,
            ip TEXT,
            user_agent TEXT,
            fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_fin TIMESTAMP,
            activa BOOLEAN DEFAULT TRUE
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_admin (
            id SERIAL PRIMARY KEY,
            accion TEXT,
            admin_id INTEGER REFERENCES usuarios(id),
            admin_ip TEXT,
            usuario_afectado_id INTEGER,
            detalles TEXT,
            hash_verificacion TEXT,
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS palabras_prohibidas (
            id SERIAL PRIMARY KEY,
            palabra TEXT UNIQUE,
            severidad INTEGER DEFAULT 1,
            fecha_agregada TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS productos_tienda (
            id SERIAL PRIMARY KEY,
            nombre TEXT,
            creditos INTEGER,
            precio_usd REAL,
            activo BOOLEAN DEFAULT TRUE
        )
    `);
    
    // Insertar productos por defecto
    const productos = await pool.query('SELECT COUNT(*) FROM productos_tienda');
    if (parseInt(productos.rows[0].count) === 0) {
        await pool.query(`
            INSERT INTO productos_tienda (nombre, creditos, precio_usd) VALUES
            ('10 Créditos', 10, 1.00),
            ('50 Créditos', 50, 4.00),
            ('100 Créditos', 100, 7.00),
            ('500 Créditos', 500, 30.00),
            ('1000 Créditos', 1000, 50.00)
        `);
    }
    
    // Insertar palabras prohibidas
    const palabras = await pool.query('SELECT COUNT(*) FROM palabras_prohibidas');
    if (parseInt(palabras.rows[0].count) === 0) {
        const palabrasIniciales = ['puta', 'puto', 'mierda', 'coño', 'cabron', 'pendejo', 'hijoputa', 'fuck', 'shit', 'bitch'];
        for (const palabra of palabrasIniciales) {
            await pool.query('INSERT INTO palabras_prohibidas (palabra) VALUES ($1)', [palabra]);
        }
    }
    
    console.log('✅ Tablas PostgreSQL creadas/verificadas');
    return pool;
}

function getPool() {
    return pool;
}

module.exports = {
    initializePostgreSQL,
    getPool
};