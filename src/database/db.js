const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');

let db = null;

// Asegurar directorio de datos
const dataDir = path.dirname(config.DATABASE_URL);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Función para encriptar datos sensibles
function encryptData(text, key) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

// Función para desencriptar datos sensibles
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
    try {
        db = await open({
            filename: config.DATABASE_URL,
            driver: sqlite3.Database
        });
        
        console.log('✓ Base de datos conectada');
        
        // Habilitar foreign keys
        await db.exec('PRAGMA foreign_keys = ON');
        
        // Crear tablas
        await createTables();
        
        return db;
    } catch (error) {
        console.error('Error conectando a la base de datos:', error);
        throw error;
    }
}

async function createTables() {
    // Tabla de usuarios
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
            fingerprint TEXT,
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
            ultimo_credito_diario DATETIME,
            FOREIGN KEY (invitado_por) REFERENCES usuarios(id)
        )
    `);
    
    // Tabla de historial de nombres
    await db.exec(`
        CREATE TABLE IF NOT EXISTS historial_nombres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nombre_anterior TEXT,
            nombre_nuevo TEXT,
            creditos_gastados INTEGER,
            fecha_cambio DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    // Tabla de transacciones de créditos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS transacciones_creditos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            cantidad INTEGER,
            tipo TEXT,
            descripcion TEXT,
            monto_pagado REAL,
            metodo_pago TEXT,
            referencia_pago TEXT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    // Tabla de mensajes de chat
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
    
    // Tabla de posts del foro
    await db.exec(`
        CREATE TABLE IF NOT EXISTS posts_foro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            titulo TEXT,
            contenido TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            respuestas_count INTEGER DEFAULT 0,
            destacado BOOLEAN DEFAULT 0,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    // Tabla de comentarios del foro
    await db.exec(`
        CREATE TABLE IF NOT EXISTS comentarios_foro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            usuario_id INTEGER,
            contenido TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_origen TEXT,
            FOREIGN KEY (post_id) REFERENCES posts_foro(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    
    // Tabla de sesiones
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
    
    // Tabla de auditoría
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
    
    // Tabla de palabras prohibidas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS palabras_prohibidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            palabra TEXT UNIQUE,
            severidad INTEGER DEFAULT 1,
            fecha_agregada DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Tabla de productos de tienda
    await db.exec(`
        CREATE TABLE IF NOT EXISTS productos_tienda (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            creditos INTEGER,
            precio_usd REAL,
            activo BOOLEAN DEFAULT 1
        )
    `);
    
    // Insertar productos por defecto si no existen
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
    
    // Insertar palabras prohibidas por defecto
    const palabrasCount = await db.get('SELECT COUNT(*) as count FROM palabras_prohibidas');
    if (palabrasCount.count === 0) {
        const palabrasIniciales = [
            'puta', 'puto', 'mierda', 'coño', 'cabron', 'cabrona',
            'pendejo', 'pendeja', 'hijoputa', 'malparido', 'gonorrea',
            'chupapija', 'culiao', 'fuck', 'shit', 'bitch', 'asshole'
        ];
        for (const palabra of palabrasIniciales) {
            await db.run('INSERT INTO palabras_prohibidas (palabra) VALUES (?)', palabra);
        }
    }
    
    console.log('✓ Tablas creadas/verificadas');
}

module.exports = {
    initializeDatabase,
    getDb: () => db,
    encryptData,
    decryptData
};