/* events.mjs — bus de eventos pub/sub, columna vertebral de la reactividad. */

export class EventBus {
  constructor() {
    this._subs = new Map();
  }

  on(type, fn) {
    if (!this._subs.has(type)) this._subs.set(type, new Set());
    this._subs.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => { off(); fn(payload); });
    return off;
  }

  off(type, fn) {
    this._subs.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const subs = this._subs.get(type);
    if (!subs) return;
    for (const fn of [...subs]) {
      try { fn(payload); } catch (e) { console.error('[bus]', type, e); }
    }
  }

  clear() { this._subs.clear(); }
}

export const bus = new EventBus();
