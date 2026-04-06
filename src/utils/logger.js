const fs = require('fs');
const path = require('path');

const LOG_DIR = './logs';

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFileName() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.log`;
}

function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    const logFile = path.join(LOG_DIR, getLogFileName());
    
    fs.appendFileSync(logFile, logLine);
    
    if (level === 'ERROR') {
        console.error(logLine);
    } else if (level === 'WARN') {
        console.warn(logLine);
    } else {
        console.log(logLine);
    }
}

function info(message, data = null) {
    writeLog('INFO', message, data);
}

function warn(message, data = null) {
    writeLog('WARN', message, data);
}

function error(message, data = null) {
    writeLog('ERROR', message, data);
}

function debug(message, data = null) {
    if (process.env.NODE_ENV !== 'production') {
        writeLog('DEBUG', message, data);
    }
}

module.exports = {
    info,
    warn,
    error,
    debug
};