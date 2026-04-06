// SCRIPT DE DIAGNÓSTICO - AnonChat
// Ejecutar con: node diagnostico.js

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     🔍 DIAGNÓSTICO COMPLETO - ANONCHAT                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let errores = 0;
let ok = 0;

// ============================================
// 1. VERIFICAR ARCHIVOS Y CARPETAS
// ============================================
console.log('📁 VERIFICANDO ESTRUCTURA DE ARCHIVOS...\n');

const archivosRequeridos = [
    'package.json',
    'src/server.js',
    'src/routes/auth.js',
    'src/routes/chat.js',
    'src/routes/foro.js',
    'src/routes/admin.js',
    'src/routes/usuario.js',
    'src/routes/tienda.js',
    'src/database/db.js',
    'src/middleware/auth.js',
    'src/middleware/security.js',
    'src/services/websocket.js',
    'src/crypto/rsa.js',
    'src/crypto/aes.js',
    'src/crypto/fingerprint.js',
    'src/utils/logger.js',
    'src/utils/profanity.js',
    'src/config/env.js',
    'frontend/public/index.html',
    'frontend/public/chat.html',
    'frontend/public/login.html',
    'frontend/public/admin.html',
    'frontend/public/foro.html',
    'frontend/public/perfil.html',
    'frontend/public/tienda.html',
    'frontend/public/js/app.js',
    'frontend/public/css/styles.css',
    '.env'
];

for (const archivo of archivosRequeridos) {
    const ruta = path.join(__dirname, archivo);
    if (fs.existsSync(ruta)) {
        console.log(`   ✅ ${archivo}`);
        ok++;
    } else {
        console.log(`   ❌ FALTA: ${archivo}`);
        errores++;
    }
}

// ============================================
// 2. VERIFICAR CARPETAS CREADAS
// ============================================
console.log('\n📁 VERIFICANDO CARPETAS...\n');

const carpetas = ['data', 'keys', 'logs', 'backups', 'frontend/public/css', 'frontend/public/js'];
for (const carpeta of carpetas) {
    const ruta = path.join(__dirname, carpeta);
    if (fs.existsSync(ruta)) {
        console.log(`   ✅ ${carpeta}/`);
        ok++;
    } else {
        console.log(`   ❌ FALTA CARPETA: ${carpeta}/`);
        errores++;
    }
}

// ============================================
// 3. VERIFICAR BASE DE DATOS
// ============================================
console.log('\n💾 VERIFICANDO BASE DE DATOS...\n');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
if (fs.existsSync(dbPath)) {
    console.log(`   ✅ Base de datos encontrada: ${dbPath}`);
    ok++;
    
    // Conectar y verificar tablas
    (async () => {
        try {
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });
            
            const tablas = ['usuarios', 'mensajes_chat', 'posts_foro', 'comentarios_foro', 'sesiones'];
            for (const tabla of tablas) {
                const result = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tabla}'`);
                if (result) {
                    console.log(`   ✅ Tabla: ${tabla}`);
                    ok++;
                } else {
                    console.log(`   ❌ FALTA TABLA: ${tabla}`);
                    errores++;
                }
            }
            
            // Verificar admin
            const admin = await db.get('SELECT id, username, rol FROM usuarios WHERE rol = ?', ['admin']);
            if (admin) {
                console.log(`   ✅ Usuario admin existe: ${admin.username} (ID: ${admin.id})`);
                ok++;
            } else {
                console.log(`   ❌ No existe usuario admin`);
                errores++;
            }
            
            // Contar usuarios
            const totalUsers = await db.get('SELECT COUNT(*) as count FROM usuarios');
            console.log(`   📊 Total usuarios registrados: ${totalUsers.count}`);
            
            await db.close();
        } catch (err) {
            console.log(`   ❌ Error en base de datos: ${err.message}`);
            errores++;
        }
    })().then(() => {
        continuarDiagnostico();
    });
} else {
    console.log(`   ❌ Base de datos NO encontrada en: ${dbPath}`);
    errores++;
    continuarDiagnostico();
}

function continuarDiagnostico() {
    // ============================================
    // 4. VERIFICAR DEPENDENCIAS NPM
    // ============================================
    console.log('\n📦 VERIFICANDO DEPENDENCIAS...\n');
    
    const packagePath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const dependencias = packageJson.dependencies || {};
        
        const dependenciasRequeridas = [
            'express', 'socket.io', 'sqlite3', 'bcryptjs', 
            'jsonwebtoken', 'helmet', 'cors', 'dotenv', 'node-rsa'
        ];
        
        for (const dep of dependenciasRequeridas) {
            if (dependencias[dep]) {
                console.log(`   ✅ ${dep}@${dependencias[dep]}`);
                ok++;
            } else {
                console.log(`   ❌ Falta dependencia: ${dep}`);
                errores++;
            }
        }
    }
    
    // ============================================
    // 5. VERIFICAR VARIABLES DE ENTORNO
    // ============================================
    console.log('\n🔐 VERIFICANDO CONFIGURACIÓN...\n');
    
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        console.log(`   ✅ Archivo .env existe`);
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('JWT_SECRET')) {
            console.log(`   ✅ JWT_SECRET configurado`);
            ok++;
        } else {
            console.log(`   ❌ JWT_SECRET no encontrado`);
            errores++;
        }
    } else {
        console.log(`   ❌ Archivo .env NO existe`);
        errores++;
    }
    
    // ============================================
    // 6. VERIFICAR CLAVES RSA
    // ============================================
    console.log('\n🔑 VERIFICANDO CLAVES RSA...\n');
    
    const publicKeyPath = path.join(__dirname, 'keys', 'public.pem');
    const privateKeyPath = path.join(__dirname, 'keys', 'private.pem');
    
    if (fs.existsSync(publicKeyPath)) {
        console.log(`   ✅ Clave pública RSA existe`);
        ok++;
    } else {
        console.log(`   ❌ Falta clave pública RSA`);
        errores++;
    }
    
    if (fs.existsSync(privateKeyPath)) {
        console.log(`   ✅ Clave privada RSA existe`);
        ok++;
    } else {
        console.log(`   ❌ Falta clave privada RSA`);
        errores++;
    }
    
    // ============================================
    // 7. VERIFICAR PUERTO
    // ============================================
    console.log('\n🌐 VERIFICANDO PUERTO...\n');
    
    const net = require('net');
    const port = 3000;
    const tester = net.createServer()
        .once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`   ⚠️ Puerto ${port} está en uso (la app puede estar corriendo)`);
            } else {
                console.log(`   ✅ Puerto ${port} está disponible`);
                ok++;
            }
        })
        .once('listening', () => {
            console.log(`   ✅ Puerto ${port} está disponible`);
            ok++;
            tester.close();
        })
        .listen(port);
    
    setTimeout(() => {
        // ============================================
        // 8. RESUMEN FINAL
        // ============================================
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    📊 RESUMEN FINAL                        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        
        console.log(`   ✅ Correctos: ${ok}`);
        console.log(`   ❌ Errores: ${errores}`);
        
        if (errores === 0) {
            console.log('\n🎉 TODO ESTÁ CORRECTO. La app debería funcionar.\n');
            console.log('Si aún no funciona, el problema puede ser:');
            console.log('   1. El servidor no está corriendo (ejecuta npm start)');
            console.log('   2. Hay errores en la consola del navegador (F12)');
            console.log('   3. Los archivos HTML tienen errores de JavaScript');
        } else {
            console.log(`\n⚠️ Hay ${errores} problemas que resolver.\n`);
            console.log('Revisa los ❌ de arriba y arregla lo que falta.\n');
        }
        
        console.log('📝 Para más detalles, ejecuta: npm start y mira la terminal\n');
        
    }, 1000);
}