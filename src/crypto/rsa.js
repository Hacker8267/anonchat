const NodeRSA = require('node-rsa');
const fs = require('fs');
const config = require('../config/env');

let rsaPublicKey = null;
let rsaPrivateKey = null;

function loadKeys() {
    try {
        // 1. INTENTAR CARGAR DESDE VARIABLE DE ENTORNO (RENDER)
        if (process.env.RSA_PRIVATE_KEY) {
            console.log('🔐 Cargando clave RSA desde variable de entorno');
            const privateKeyPem = process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
            rsaPrivateKey = new NodeRSA(privateKeyPem);
            rsaPrivateKey.setOptions({ encryptionScheme: 'pkcs1_oaep' });
            console.log('✓ Clave RSA privada cargada desde variable de entorno');
            
            // También intentar cargar la pública si existe
            if (process.env.RSA_PUBLIC_KEY) {
                const publicKeyPem = process.env.RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
                rsaPublicKey = new NodeRSA(publicKeyPem);
                rsaPublicKey.setOptions({ encryptionScheme: 'pkcs1_oaep' });
                console.log('✓ Clave RSA pública cargada desde variable de entorno');
            }
            return true;
        }
        
        // 2. SI NO HAY VARIABLE, CARGAR DESDE ARCHIVOS (LOCAL)
        if (fs.existsSync(config.RSA_PUBLIC_KEY_PATH)) {
            const publicKeyPem = fs.readFileSync(config.RSA_PUBLIC_KEY_PATH, 'utf8');
            rsaPublicKey = new NodeRSA(publicKeyPem);
            rsaPublicKey.setOptions({ encryptionScheme: 'pkcs1_oaep' });
        }
        
        if (fs.existsSync(config.RSA_PRIVATE_KEY_PATH)) {
            const privateKeyPem = fs.readFileSync(config.RSA_PRIVATE_KEY_PATH, 'utf8');
            rsaPrivateKey = new NodeRSA(privateKeyPem);
            rsaPrivateKey.setOptions({ encryptionScheme: 'pkcs1_oaep' });
        }
        
        if (rsaPrivateKey) {
            console.log('✓ Claves RSA cargadas desde archivos');
            return true;
        }
        
        console.warn('⚠️ No se encontró clave RSA privada');
        return false;
        
    } catch (error) {
        console.error('❌ Error cargando claves RSA:', error);
        return false;
    }
}

function encryptWithPublicKey(data) {
    if (!rsaPublicKey) {
        throw new Error('RSA public key not loaded');
    }
    return rsaPublicKey.encrypt(data, 'base64');
}

function decryptWithPrivateKey(encryptedData) {
    if (!rsaPrivateKey) {
        console.warn('⚠️ No hay clave RSA privada para desencriptar');
        return encryptedData; // Si no hay clave, devolver el texto encriptado
    }
    try {
        return rsaPrivateKey.decrypt(encryptedData, 'utf8');
    } catch (error) {
        console.error('Error desencriptando:', error);
        return '[Error al desencriptar]';
    }
}

function getPublicKey() {
    if (!rsaPublicKey) return null;
    return rsaPublicKey.exportKey('pkcs8-public-pem');
}

function getPublicKeyString() {
    if (!rsaPublicKey) return null;
    return rsaPublicKey.exportKey('pkcs8-public-pem');
}

module.exports = {
    loadKeys,
    encryptWithPublicKey,
    decryptWithPrivateKey,
    getPublicKey,
    getPublicKeyString
};