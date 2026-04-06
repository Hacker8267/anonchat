const { getDb } = require('../database/db');
const config = require('../config/env');

async function isUsernameAvailable(username) {
    const db = getDb();
    const user = await db.get('SELECT id FROM usuarios WHERE username = ?', [username]);
    return !user;
}

async function isUsernameValid(username) {
    if (!username) return false;
    
    if (username.length < config.USERNAME_MIN_LENGTH || username.length > config.USERNAME_MAX_LENGTH) {
        return false;
    }
    
    if (!config.USERNAME_PATTERN.test(username)) {
        return false;
    }
    
    if (config.USERNAME_RESERVED.includes(username.toLowerCase())) {
        return false;
    }
    
    return true;
}

function isValidIP(ip) {
    const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(ip);
}

function isValidUUID(uuid) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(uuid);
}

module.exports = {
    isUsernameAvailable,
    isUsernameValid,
    isValidIP,
    isValidUUID
};