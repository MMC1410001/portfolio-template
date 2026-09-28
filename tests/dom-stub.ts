/**
 * The smallest browser that lib/analytics/{queue,tag,clicks}.ts will run in.
 *
 * Hand-rolled rather than jsdom or happy-dom, because the whole test suite is
 * `node --test` with no DOM dependency, and these modules touch very little:
 * `window.location`, the viewport, two storages, `document.addEventListener`
 * and `Element.closest`. What is stubbed is exactly that, and nothing else.
 *
 * Importing this module installs the globals. It must be the FIRST import in
 * a test file, so it evaluates before any module that reads them.
 *
 * `closest()` understands only what the analytics code asks of it: a comma
 * list of tag names, `[attr]` and `[attr='value']`. An unsupported selector
 * throws rather than quietly matching nothing, so a new selector in clicks.ts
 * fails this stub loudly instead of passing a test for the wrong reason.
 */

type Listener = (event: unknown) => void;

class Listeners {
  private map = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    const list = this.map.get(type) ?? [];
    list.push(fn);
    this.map.set(type, list);
  }
  removeEventListener(type: string, fn: Listener): void {
    const list = this.map.get(type) ?? [];
    this.map.set(type, list.filter((l) => l !== fn));
  }
  dispatch(type: string, event: unknown): void {
    for (const fn of this.map.get(type) ?? []) fn(event);
  }
}

function matchesOne(el: FakeElement, selector: string): boolean {
  const s = selector.trim();
  const attr = /^\[([a-z-]+)(?:='([^']*)')?\]$/.exec(s);
  if (attr) {
    const value = el.getAttribute(attr[1]);
    return attr[2] === undefined ? value !== null : value === attr[2];
  }
  if (/^[a-z][a-z0-9]*$/.test(s)) return el.tagName.toLowerCase() === s;
  throw new Error(`dom-stub: unsupported selector "${s}"`);
}

export class FakeElement {
  tagName: string;
  parent: FakeElement | null = null;
  children: (FakeElement | string)[] = [];
  private attrs = new Map<string, string>();

  constructor(tag: string, attrs: Record<string, string> = {}, children: (FakeElement | string)[] = []) {
    this.tagName = tag.toUpperCase();
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    for (const child of children) this.append(child);
  }

  append(child: FakeElement | string): this {
    if (typeof child !== 'string') child.parent = this;
    this.children.push(child);
    return this;
  }

  get id(): string {
    return this.attrs.get('id') ?? '';
  }

  get textContent(): string {
    return this.children
      .map((c) => (typeof c === 'string' ? c : c.textContent))
      .join('');
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  closest(selector: string): FakeElement | null {
    const parts = selector.split(',');
    if (parts.some((p) => matchesOne(this, p))) return this;
    return this.parent ? this.parent.closest(selector) : null;
  }
}

/**
 * Build an element tree: `h('div', {class: 'x'}, 'text', h('span'))`.
 *
 * Typed as a real `Element` so it can be handed to the functions under test;
 * the cast is the stub's whole premise, and it is contained here.
 */
export function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (Element | string)[]
): Element {
  const fakes = children as unknown as (FakeElement | string)[];
  return new FakeElement(tag, attrs, fakes) as unknown as Element;
}

class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const documentEvents = new Listeners();
const windowEvents = new Listeners();

export const fakeDocument = {
  referrer: '',
  visibilityState: 'visible',
  documentElement: { clientWidth: 1440, scrollHeight: 4000 },
  addEventListener: (type: string, fn: Listener) => documentEvents.addEventListener(type, fn),
  removeEventListener: (type: string, fn: Listener) => documentEvents.removeEventListener(type, fn),
};

export const fakeWindow: Record<string, unknown> = {
  location: { pathname: '/', search: '', origin: 'http://localhost' },
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener: (type: string, fn: Listener) => windowEvents.addEventListener(type, fn),
  removeEventListener: (type: string, fn: Listener) => windowEvents.removeEventListener(type, fn),
};
// Not framed: scope.ts's isEmbedded() compares these two.
fakeWindow.self = fakeWindow;
fakeWindow.top = fakeWindow;

export const local = new FakeStorage();
export const session = new FakeStorage();

const g = globalThis as Record<string, unknown>;
g.window = fakeWindow;
g.document = fakeDocument;
g.localStorage = local;
g.sessionStorage = session;

/** A capture-phase click on `target` at page coordinates (x, y). */
export function click(target: Element, x = 100, y = 100): void {
  documentEvents.dispatch('click', { target, pageX: x, pageY: y });
}

/** Back to a first-visit browser: empty storage, not opted out. */
export function resetBrowser(): void {
  local.clear();
  session.clear();
}
