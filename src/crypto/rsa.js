const NodeRSA = require('node-rsa');
const fs = require('fs');
const config = require('../config/env');

let rsaPublicKey = null;
let rsaPrivateKey = null;

function loadKeys() {
    try {
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
        
        console.log('✓ Claves RSA cargadas');
        return true;
    } catch (error) {
        console.error('Error cargando claves RSA:', error);
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
        throw new Error('RSA private key not loaded');
    }
    return rsaPrivateKey.decrypt(encryptedData, 'utf8');
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