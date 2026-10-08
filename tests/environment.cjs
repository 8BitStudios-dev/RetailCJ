'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const gameDirectory = path.resolve(__dirname, '..');

// This harness executes the actual page and modules. Canvas drawing is checked
// for valid arguments; gameplay, state transitions and dispatch are not mocked.
function makeEnvironment(options = {}) {
  const html = fs.readFileSync(path.join(gameDirectory, 'index.html'), 'utf8');
  const elements = new Map();
  const counters = { surfaces: 0, fills: 0, images: 0, animationRequests: 0 };
  const documentListeners = new Map();
  let document;

  function matches(element, selector) {
    selector = selector.trim();
    if (selector.includes(',')) return selector.split(',').some(s => matches(element, s));
    const combined = selector.match(/^([a-z][\w-]*)(\[.+\]|[.#].+)$/i);
    if (combined) return element.tagName.toLowerCase() === combined[1].toLowerCase() && matches(element, combined[2]);
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) return element.classes.has(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
    if (attribute) {
      const value = element.getAttribute(attribute[1]);
      return value !== null && (attribute[2] === undefined || value === attribute[2]);
    }
    return element.tagName.toLowerCase() === selector.toLowerCase();
  }

  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.listeners = new Map();
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.open = false;
      this.width = 0;
      this.height = 0;
      this.classes = new Set();
      this.textContent = '';
      this.parentElement = null;
      this._html = '';
      this.classList = {
        add: (...classes) => classes.forEach(c => this.classes.add(c)),
        remove: (...classes) => classes.forEach(c => this.classes.delete(c)),
        contains: c => this.classes.has(c),
        toggle: (c, force) => {
          const enabled = force === undefined ? !this.classes.has(c) : force;
          if (enabled) this.classes.add(c); else this.classes.delete(c);
          return enabled;
        },
      };
    }
    set id(value) { this._id = value; if (value) elements.set(value, this); }
    get id() { return this._id || ''; }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    set innerHTML(value) {
      this._html = String(value);
      const unregister = node => {
        node.children.forEach(unregister);
        if (node.id && elements.get(node.id) === node) elements.delete(node.id);
      };
      this.children.forEach(unregister);
      this.children = [];
      parseElements(this._html, this);
    }
    get innerHTML() { return this._html; }
    setAttribute(name, value) {
      value = String(value);
      this.attributes.set(name, value);
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
      if (name === 'hidden') this.hidden = true;
      if (name === 'disabled') this.disabled = true;
      if (name === 'open') this.open = true;
      if (name === 'width' || name === 'height') this[name] = +value;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        this.dataset[key] = value;
      }
    }
    getAttribute(name) {
      if (name === 'id') return this.id || null;
      if (name === 'class') return this.className || null;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return Object.hasOwn(this.dataset, key) ? this.dataset[key] : null;
      }
      return this.attributes.get(name) ?? null;
    }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === 'hidden') this.hidden = false;
      if (name === 'disabled') this.disabled = false;
      if (name === 'open') this.open = false;
    }
    appendChild(element) { element.parentElement = this; this.children.push(element); return element; }
    prepend(element) { element.parentElement = this; this.children.unshift(element); }
    append(...items) { items.filter(item => typeof item === 'object').forEach(item => this.appendChild(item)); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(el => el !== this);
      if (this.id) elements.delete(this.id);
    }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) if (matches(element, selector)) return element;
      return null;
    }
    querySelectorAll(selector) {
      const result = [];
      const visit = node => node.children.forEach(child => {
        if (matches(child, selector)) result.push(child);
        visit(child);
      });
      visit(this);
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }
    dispatch(type, payload = {}) {
      const event = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...payload };
      for (let node = this; node; node = node.parentElement) {
        event.currentTarget = node;
        for (const handler of node.listeners.get(type) || []) handler(event);
        if (event.stopped) return;
      }
      for (const handler of documentListeners.get(type) || []) handler(event);
    }
    click() { if (!this.disabled) this.dispatch('click'); }
    getBoundingClientRect() { return {left: 12, top: 120, width: 576, height: 760}; }
    getContext() {
      if (this.context) return this.context;
      counters.surfaces++;
      const numeric = args => args.forEach(value => assert.ok(Number.isFinite(value), 'Non-finite canvas coordinate: ' + value));
      this.context = {
        canvas: this, imageSmoothingEnabled: true,
        fillRect: (...args) => { numeric(args); counters.fills++; },
        clearRect: (...args) => numeric(args), strokeRect: (...args) => numeric(args),
        drawImage: (image, ...args) => {
          assert.ok(image.width > 0 && image.height > 0, 'Empty cached image');
          numeric(args); counters.images++;
        },
        save() {}, restore() {}, beginPath() {}, rect: (...args) => numeric(args), clip() {},
      };
      return this.context;
    }
  }

  function parseElements(markup, parent) {
    const stack = [parent];
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    markup = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    for (const tag of markup.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        const index = stack.findLastIndex(element => element.tagName.toLowerCase() === name);
        if (index > 0) stack.length = index;
        continue;
      }
      const element = new Element(name);
      for (const attribute of tag[3].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        element.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      }
      stack[stack.length - 1].appendChild(element);
      if (!voidTags.has(name) && !tag[3].trim().endsWith('/')) stack.push(element);
    }
  }

  const body = new Element('body');
  parseElements(html, body);
  document = {
    body, documentElement: new Element('html'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => new Element(tag),
    querySelector(selector) {
      const compound = selector.match(/^(#[\w-]+)\s+(.+)$/);
      if (compound) return elements.get(compound[1].slice(1))?.querySelector(compound[2]) || null;
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      if (selector === '#speed button') return body.querySelectorAll('button').filter(el => el.dataset.s !== undefined);
      return body.querySelectorAll(selector);
    },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
  };

  let randomState = options.seed ?? 0x12345678;
  const math = Object.create(Math);
  math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const storage = new Map();
  const context = {
    console, document, Math: math,
    performance: { now: () => 0 },
    requestAnimationFrame() { counters.animationRequests++; },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout, clearTimeout,
  };
  if (options.specialistMode !== undefined) context.PL_SPECIALIST_MODE = options.specialistMode;
  context.window = context;
  vm.createContext(context);
  for (const file of ['graphics-interior.js', 'graphics-walls.js', 'graphics-people.js', 'specialist-mode.js', 'specialist-ui.js', 'game-modes.js']) {
    const source = path.join(gameDirectory, file);
    if (!fs.existsSync(source)) throw new Error('Specialist integration is not ready: missing ' + file);
    vm.runInContext(fs.readFileSync(source, 'utf8'), context, {filename: file});
  }
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => source.trim()).join('\n');
  vm.runInContext(inline, context, {filename: 'index.html'});

  const evaluate = expression => vm.runInContext(expression, context, {timeout: 10000});
  return {
    html, context, counters, evaluate,
    get: id => elements.get(id) || null,
    mode: () => evaluate('playerMode'),
    game: () => evaluate('game'),
    view: () => JSON.parse(JSON.stringify(evaluate('playerMode.view()'))),
    advance(minutes, dt = 0.05) {
      evaluate(`for (let remaining = ${minutes}; remaining > 0; remaining -= ${dt}) step(Math.min(${dt}, remaining));`);
    },
  };
}

module.exports = {makeEnvironment};
