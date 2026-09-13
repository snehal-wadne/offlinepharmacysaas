/**
 * Dexie Shim
 * Provides an in-memory and localStorage-backed Dexie API implementation
 * when dexie is not installed in node_modules.
 */

class Collection {
  constructor(table, filterFn) {
    this.table = table;
    this.filterFn = filterFn || (() => true);
    this._limit = null;
    this._reverse = false;
    this._sortBy = null;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  reverse() {
    this._reverse = true;
    return this;
  }

  sortBy(key) {
    this._sortBy = key;
    return this;
  }

  async toArray() {
    let items = Array.from(this.table._store.values()).filter(this.filterFn);
    if (this._sortBy) {
      items.sort((a, b) => (a[this._sortBy] > b[this._sortBy] ? 1 : -1));
    }
    if (this._reverse) {
      items.reverse();
    }
    if (this._limit !== null) {
      items = items.slice(0, this._limit);
    }
    return items;
  }

  async first() {
    const items = await this.toArray();
    return items[0] || undefined;
  }

  async count() {
    const items = await this.toArray();
    return items.length;
  }

  async delete() {
    const items = await this.toArray();
    for (const item of items) {
      const key = this.table._extractKey(item);
      if (key !== undefined) this.table._store.delete(key);
    }
    this.table._persist();
  }

  async modify(changes) {
    const items = await this.toArray();
    for (const item of items) {
      if (typeof changes === 'function') {
        changes(item);
      } else if (typeof changes === 'object') {
        Object.assign(item, changes);
      }
      const key = this.table._extractKey(item);
      if (key !== undefined) this.table._store.set(key, item);
    }
    this.table._persist();
  }
}

class WhereClause {
  constructor(table, index) {
    this.table = table;
    this.index = index;
  }

  equals(val) {
    const isCompound = this.index.startsWith('[') && this.index.endsWith(']');
    if (isCompound) {
      const parts = this.index.slice(1, -1).split('+');
      return new Collection(this.table, (item) => {
        if (!Array.isArray(val)) return false;
        return parts.every((p, idx) => item[p] === val[idx]);
      });
    }

    return new Collection(this.table, (item) => item[this.index] === val);
  }

  anyOf(vals) {
    const set = new Set(vals);
    return new Collection(this.table, (item) => set.has(item[this.index]));
  }

  between(lower, upper, includeLower = true, includeUpper = true) {
    return new Collection(this.table, (item) => {
      const v = item[this.index];
      const lowOk = includeLower ? v >= lower : v > lower;
      const upOk = includeUpper ? v <= upper : v < upper;
      return lowOk && upOk;
    });
  }
}

class Table {
  constructor(dbName, tableName, schemaDef) {
    this.dbName = dbName;
    this.name = tableName;
    this.schemaDef = schemaDef || '';
    this._store = new Map();
    this._load();
  }

  _getStorageKey() {
    return `__pharmaflow_shim_${this.dbName}_${this.name}`;
  }

  _load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this._getStorageKey());
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const item of list) {
              const k = this._extractKey(item);
              if (k !== undefined) this._store.set(k, item);
            }
          }
        }
      }
    } catch (e) {}
  }

  _persist() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const list = Array.from(this._store.values());
        window.localStorage.setItem(this._getStorageKey(), JSON.stringify(list));
      }
    } catch (e) {}
  }

  _extractKey(item) {
    if (!item) return undefined;
    if (this.schemaDef) {
      const primary = this.schemaDef.split(',')[0].trim().replace(/^\+\+/, '');
      if (item[primary] !== undefined) return item[primary];
    }
    return item.id || item.productId || item.customerId || item.transactionId || item.key || item.sequence;
  }

  async get(key) {
    return this._store.get(key);
  }

  async put(item) {
    let key = this._extractKey(item);
    if (key === undefined) {
      key = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const primary = this.schemaDef ? this.schemaDef.split(',')[0].trim().replace(/^\+\+/, '') : 'id';
      item[primary] = key;
    }
    this._store.set(key, item);
    this._persist();
    return key;
  }

  async bulkPut(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      let key = this._extractKey(item);
      if (key === undefined) {
        key = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const primary = this.schemaDef ? this.schemaDef.split(',')[0].trim().replace(/^\+\+/, '') : 'id';
        item[primary] = key;
      }
      this._store.set(key, item);
    }
    this._persist();
  }

  async add(item) {
    return this.put(item);
  }

  async delete(key) {
    this._store.delete(key);
    this._persist();
  }

  async clear() {
    this._store.clear();
    this._persist();
  }

  async toArray() {
    return Array.from(this._store.values());
  }

  async count() {
    return this._store.size;
  }

  where(index) {
    return new WhereClause(this, index);
  }

  filter(fn) {
    return new Collection(this, fn);
  }

  orderBy(field) {
    return new Collection(this).sortBy(field);
  }
}

class Dexie {
  constructor(dbName = 'pharmaflow_local') {
    this.name = dbName;
    this._version = 1;
    this._stores = {};
  }

  version(v) {
    this._version = v;
    return {
      stores: (schema) => {
        this._stores = schema;
        for (const [tableName, schemaDef] of Object.entries(schema)) {
          if (!this[tableName]) {
            this[tableName] = new Table(this.name, tableName, schemaDef);
          }
        }
        return this;
      },
      upgrade: () => this,
    };
  }

  async open() {
    return this;
  }

  close() {}

  async transaction(mode, tables, callback) {
    return callback();
  }
}

export default Dexie;
export { Dexie, Table, Collection };
