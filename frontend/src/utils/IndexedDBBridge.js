class IndexedDBBridge {
  constructor(dbName = 'RescueLinkOffline', storeName = 'telemetry_queue', keyPath = 'msgId') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.keyPath = keyPath;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: this.keyPath });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  async enqueue(item) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAll() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async dequeue(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clear() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

// Lazy singletons — instantiated on first use, never at module evaluation time
// This prevents Webpack TDZ crash when this module is part of a circular import chain
let _offlineQueue = null;
let _mapTilesCache = null;

export const offlineQueue = {
  enqueue: (...args) => { if (!_offlineQueue) _offlineQueue = new IndexedDBBridge(); return _offlineQueue.enqueue(...args); },
  get: (...args) => { if (!_offlineQueue) _offlineQueue = new IndexedDBBridge(); return _offlineQueue.get(...args); },
  getAll: (...args) => { if (!_offlineQueue) _offlineQueue = new IndexedDBBridge(); return _offlineQueue.getAll(...args); },
  dequeue: (...args) => { if (!_offlineQueue) _offlineQueue = new IndexedDBBridge(); return _offlineQueue.dequeue(...args); },
  clear: (...args) => { if (!_offlineQueue) _offlineQueue = new IndexedDBBridge(); return _offlineQueue.clear(...args); },
};

export const mapTilesCache = {
  enqueue: (...args) => { if (!_mapTilesCache) _mapTilesCache = new IndexedDBBridge('RescueLinkMapsTiles', 'tile_cache', 'tileKey'); return _mapTilesCache.enqueue(...args); },
  get: (...args) => { if (!_mapTilesCache) _mapTilesCache = new IndexedDBBridge('RescueLinkMapsTiles', 'tile_cache', 'tileKey'); return _mapTilesCache.get(...args); },
  getAll: (...args) => { if (!_mapTilesCache) _mapTilesCache = new IndexedDBBridge('RescueLinkMapsTiles', 'tile_cache', 'tileKey'); return _mapTilesCache.getAll(...args); },
  dequeue: (...args) => { if (!_mapTilesCache) _mapTilesCache = new IndexedDBBridge('RescueLinkMapsTiles', 'tile_cache', 'tileKey'); return _mapTilesCache.dequeue(...args); },
  clear: (...args) => { if (!_mapTilesCache) _mapTilesCache = new IndexedDBBridge('RescueLinkMapsTiles', 'tile_cache', 'tileKey'); return _mapTilesCache.clear(...args); },
};

