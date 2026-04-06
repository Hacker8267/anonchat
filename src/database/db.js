const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');

let db = null;
let isPostgres = false;

// Función para encriptar datos sensibles (SQLite)
function encryptData(text, key) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptData(encryptedText, key) {
    if (!encryptedText) return null;
    const [ivHex, encrypted, authTagHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function initializeDatabase() {
    // Si hay DATABASE_URL en Render (PostgreSQL), usarlo
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql')) {
        console.log('🔄 Conectando a PostgreSQL (Render)...');
        const pg = require('./pg');
        await pg.initializePostgreSQL();
        isPostgres = true;
        db = pg.getPool();
        console.log('✓ PostgreSQL conectado');
        return db;
    }
    
    // Si no, usar SQLite (local)
    console.log('🔄 Usando SQLite (local)...');
    const dataDir = path.dirname(config.DATABASE_URL);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = await open({
        filename: config.DATABASE_URL,
        driver: sqlite3.Database
    });
    
    await db.exec('PRAGMA foreign_keys = ON');
    await createTablesSQLite();
    console.log('✓ SQLite conectado');
    return db;
}

// Tablas para SQLite
async function createTablesSQLite() {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            username_original TEXT,
            password_hash TEXT,
            rol TEXT DEFAULT 'user',
            creditos INTEGER DEFAULT 3,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            ultimo_acceso DATETIME,
            ip_registro TEXT,
            ip_actual TEXT,
            fingerprint TEXT UNIQUE,
            user_agent TEXT,
            pais TEXT,
            ciudad TEXT,
            dispositivo TEXT,
            esta_bloqueado BOOLEAN DEFAULT 0,
            bloqueado_hasta DATETIME,
            razon_bloqueo TEXT,
            cambio_nombre_count INTEGER DEFAULT 0,
            ultimo_cambio_nombre DATETIME,
            codigo_invitacion TEXT UNIQUE,
            invitado_por INTEGER,
            ultimo_credito_diario DATETIME
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS mensajes_chat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nombre_mostrado TEXT,
            contenido TEXT,
            fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
            destacado BOOLEAN DEFAULT 0,
            ip_origen TEXT,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS posts_foro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            titulo TEXT,
            contenido TEXT,
            imagen_url TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            respuestas_count INTEGER DEFAULT 0,
            destacado BOOLEAN DEFAULT 0,
            reacciones INTEGER DEFAULT 0,
            reacciones_heart INTEGER DEFAULT 0,
            reacciones_like INTEGER DEFAULT 0,
            reacciones_haha INTEGER DEFAULT 0,
            reacciones_wow INTEGER DEFAULT 0,
            reacciones_sad INTEGER DEFAULT 0,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS comentarios_foro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            usuario_id INTEGER,
            contenido TEXT,
            imagen_url TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            reacciones INTEGER DEFAULT 0,
            FOREIGN KEY (post_id) REFERENCES posts_foro(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            token TEXT UNIQUE,
            ip TEXT,
            user_agent TEXT,
            fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_fin DATETIME,
            activa BOOLEAN DEFAULT 1,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS auditoria_admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            accion TEXT,
            admin_id INTEGER,
            admin_ip TEXT,
            usuario_afectado_id INTEGER,
            detalles TEXT,
            hash_verificacion TEXT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES usuarios(id)
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS palabras_prohibidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            palabra TEXT UNIQUE,
            severidad INTEGER DEFAULT 1,
            fecha_agregada DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS productos_tienda (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            creditos INTEGER,
            precio_usd REAL,
            activo BOOLEAN DEFAULT 1
        )
    `);
    
    // Datos iniciales
    const productosCount = await db.get('SELECT COUNT(*) as count FROM productos_tienda');
    if (productosCount.count === 0) {
        await db.exec(`
            INSERT INTO productos_tienda (nombre, creditos, precio_usd) VALUES
            ('10 Créditos', 10, 1.00),
            ('50 Créditos', 50, 4.00),
            ('100 Créditos', 100, 7.00),
            ('500 Créditos', 500, 30.00),
            ('1000 Créditos', 1000, 50.00)
        `);
    }
    
    const palabrasCount = await db.get('SELECT COUNT(*) as count FROM palabras_prohibidas');
    if (palabrasCount.count === 0) {
        const palabrasIniciales = ['puta', 'puto', 'mierda', 'coño', 'cabron', 'pendejo', 'hijoputa', 'fuck', 'shit', 'bitch'];
        for (const palabra of palabrasIniciales) {
            await db.run('INSERT INTO palabras_prohibidas (palabra) VALUES (?)', palabra);
        }
    }
}

function getDb() {
    return db;
}

function isPostgreSQL() {
    return isPostgres;
}

module.exports = {
    initializeDatabase,
    getDb,
    isPostgreSQL,
    encryptData,
    decryptData
};