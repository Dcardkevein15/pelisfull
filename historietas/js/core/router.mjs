/* router.mjs — router de hash minimalista con parámetros :nombre. */

export class Router {
  constructor() {
    this.routes = [];
    this.current = null;
    this._onHash = () => this.resolve();
  }

  add(pattern, handler) {
    const names = [];
    const rx = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$'
    );
    this.routes.push({ pattern, rx, names, handler });
    return this;
  }

  start() {
    window.addEventListener('hashchange', this._onHash);
    this.resolve();
  }

  stop() {
    window.removeEventListener('hashchange', this._onHash);
  }

  go(path) {
    const target = path.startsWith('#') ? path : '#' + path;
    if (location.hash === target) this.resolve();
    else location.hash = target;
  }

  resolve() {
    const hash = location.hash || '#/';
    const path = hash.replace(/^#/, '') || '/';
    for (const r of this.routes) {
      const m = path.match(r.rx);
      if (m) {
        const params = {};
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        this.current = { path, pattern: r.pattern, params };
        r.handler(params);
        return this.current;
      }
    }
    this.current = { path, pattern: null, params: {} };
    return this.current;
  }
}

export const router = new Router();
