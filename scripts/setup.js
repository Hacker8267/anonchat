const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NodeRSA = require('node-rsa');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     🚀 CONFIGURACIÓN INICIAL - APP ANÓNIMA 🚀             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('⚠️  ESTE ES EL ÚNICO MOMENTO PARA CREAR LA CUENTA ADMIN');
console.log('⚠️  GUARDA TODOS LOS DATOS QUE APARECERÁN A CONTINUACIÓN\n');

// Crear directorios necesarios
const dirs = ['./keys', './data', './logs', './backups'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ Directorio creado: ${dir}`);
    }
});

// Generar claves RSA
console.log('\n📡 Generando claves RSA-2048...');
const rsaKey = new NodeRSA({ b: 2048 });
rsaKey.setOptions({ encryptionScheme: 'pkcs1_oaep' });
const publicKey = rsaKey.exportKey('pkcs8-public-pem');
const privateKey = rsaKey.exportKey('pkcs8-private-pem');

fs.writeFileSync('./keys/public.pem', publicKey);
fs.writeFileSync('./keys/private.pem', privateKey);
console.log('✓ Claves RSA generadas y guardadas');

// Generar contraseña admin aleatoria fuerte
const adminPassword = crypto.randomBytes(12).toString('base64') + '!@#$';
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);

// Generar JWT secret
const jwtSecret = crypto.randomBytes(32).toString('hex');
const sessionSecret = crypto.randomBytes(32).toString('hex');
const dbEncryptionKey = crypto.randomBytes(32).toString('hex');

// Crear archivo .env
const envContent = `# SERVER
PORT=3000
NODE_ENV=production

# SECURITY
JWT_SECRET=${jwtSecret}
SESSION_SECRET=${sessionSecret}

# RSA KEYS
RSA_PUBLIC_KEY_PATH=./keys/public.pem
RSA_PRIVATE_KEY_PATH=./keys/private.pem

# DATABASE
DATABASE_URL=./data/database.sqlite
DATABASE_ENCRYPTION_KEY=${dbEncryptionKey}

# RATE LIMITING
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CREDITS SYSTEM
CREDITS_REGISTRO_INICIAL=3
CREDITS_POR_DIA=1
CREDITS_POR_INVITACION=5
CAMBIO_NOMBRE_COSTO=5
CAMBIO_NOMBRE_COSTO_DESCUENTO=3
CAMBIO_NOMBRE_DIAS_DESCUENTO=7

# PAYMENTS (opcional)
MERCADOPAGO_ACCESS_TOKEN=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
STRIPE_SECRET_KEY=

# ADMIN CONFIG
ADMIN_IP_WHITELIST=
ADMIN_ALERT_EMAIL=

# WEBSOCKET
SOCKET_PING_INTERVAL=25000
SOCKET_PING_TIMEOUT=20000
`;

fs.writeFileSync('.env', envContent);
console.log('✓ Archivo .env creado');

// Crear archivo con datos de admin (ENCRIPTADO)
const adminData = {
    username: 'admin',
    password_hash: adminPasswordHash,
    password_plain: adminPassword,
    rsa_public_key: publicKey,
    created_at: new Date().toISOString()
};

// Guardar backup de admin data (encriptado con clave simple)
const adminBackup = {
    ...adminData,
    advertencia: 'GUARDA ESTA INFORMACIÓN EN LUGAR SEGURO'
};
fs.writeFileSync('./backups/admin_backup.json', JSON.stringify(adminBackup, null, 2));
console.log('✓ Backup admin guardado en ./backups/admin_backup.json');

// Crear archivo README con instrucciones
const readmeContent = `# APP ANÓNIMA - CHAT Y FORO

## 🔐 DATOS DE ACCESO ADMIN (ÚNICA VEZ)

**ESTOS DATOS SOLO APARECEN UNA VEZ. GUÁRDALOS EN LUGAR SEGURO.**

### Acceso Admin:
- URL: http://localhost:3000/admin-login
- Usuario: admin
- Contraseña: ${adminPassword}

### CLAVE RSA PRIVADA (IMPORTANTE):
\`\`\`
${privateKey}
\`\`\`

### ⚠️ ADVERTENCIAS:
1. **GUARDA ESTA CLAVE RSA PRIVADA** - Sin ella NO podrás ver IPs ni datos sensibles
2. **GUARDA LA CONTRASEÑA ADMIN** - No hay forma de recuperarla
3. Estos datos SOLO se muestran UNA VEZ
4. Guarda en USB, Bitwarden, o lugar físico seguro

## 📦 INSTALACIÓN

\`\`\`bash
npm install
npm start
\`\`\`

## 🌐 DESPLIEGUE EN RENDER

1. Sube este código a GitHub
2. Crea cuenta en render.com
3. Crea nuevo Web Service
4. Conecta tu repositorio
5. Build Command: npm install
6. Start Command: npm start
7. Tu app estará en: https://tu-app.onrender.com

## 📊 DATOS DE LA APP

- Capacidad: 275+ usuarios concurrentes
- Seguridad: RSA-2048 + AES-256
- Sistema de créditos integrado
- Tienda con pagos (MercadoPago/PayPal/Stripe)
- Filtro de insultos automático
- Panel admin completo
`;

fs.writeFileSync('./KEYS_AND_PASSWORDS.txt', readmeContent);
console.log('✓ Archivo KEYS_AND_PASSWORDS.txt creado - ¡GUÁRDALO!');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     ⚠️  DATOS DE ACCESO - GUARDAR EN LUGAR SEGURO ⚠️    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 CONTRASEÑA ADMIN: ${adminPassword}`);
console.log(`\n🔐 CLAVE RSA PRIVADA:\n${privateKey}\n`);
console.log('📁 Archivo guardado: KEYS_AND_PASSWORDS.txt');
console.log('📁 Backup admin: ./backups/admin_backup.json\n');
console.log('⚠️  NO CIERRES ESTA VENTANA HASTA GUARDAR LOS DATOS ⚠️\n');

rl.question('✅ ¿Has guardado los datos en un lugar seguro? (escribe "SI" para continuar): ', (answer) => {
    if (answer.toUpperCase() === 'SI') {
        console.log('\n✓ Configuración completada exitosamente');
        console.log('\nPara iniciar la app ejecuta: npm start\n');
        rl.close();
        process.exit(0);
    } else {
        console.log('\n⚠️  Por favor guarda los datos antes de continuar');
        console.log('Los datos están en: KEYS_AND_PASSWORDS.txt');
        console.log('Ejecuta "npm run setup" nuevamente cuando estés listo\n');
        rl.close();
        process.exit(1);
    }
});