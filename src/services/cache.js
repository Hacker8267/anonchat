class CacheService {
    constructor() {
        this.cache = new Map();
        this.ttl = 60 * 1000;
    }
    
    set(key, value, ttlSeconds = null) {
        const expiresAt = Date.now() + (ttlSeconds || this.ttl);
        this.cache.set(key, {
            value,
            expiresAt
        });
        
        setTimeout(() => {
            if (this.cache.has(key) && this.cache.get(key).expiresAt <= Date.now()) {
                this.cache.delete(key);
            }
        }, ttlSeconds || this.ttl);
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (item.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    delete(key) {
        this.cache.delete(key);
    }
    
    clear() {
        this.cache.clear();
    }
    
    has(key) {
        return this.cache.has(key);
    }
}

module.exports = new CacheService();