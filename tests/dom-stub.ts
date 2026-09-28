/**
 * The smallest browser that lib/analytics/{queue,tag,clicks,sections,scroll,cta}.ts
 * will run in.
 *
 * Hand-rolled rather than jsdom or happy-dom, because the whole test suite is
 * `node --test` with no DOM dependency, and these modules touch very little:
 * `window.location`, the viewport, two storages, `document.addEventListener`
 * and `Element.closest`, plus, for the observers, a body to mount elements
 * into, `getElementById`, `querySelectorAll`, and hand-driven Intersection and
 * Mutation observers. What is stubbed is exactly that, and nothing else.
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
  count(type: string): number {
    return (this.map.get(type) ?? []).length;
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
  /** An element, as MutationRecord.addedNodes filtering expects. */
  readonly nodeType = 1;
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

  /** This element and every element under it, in document order. */
  *walk(): Generator<FakeElement> {
    yield this;
    for (const child of this.children) {
      if (typeof child !== 'string') yield* child.walk();
    }
  }
}

// ── A document tree, and the two observers that watch it ─────────────────
// Enough for sections.ts and cta.ts: getElementById and querySelectorAll over
// whatever has been mount()ed into the body, a MutationObserver told about
// each mount and unmount, and an IntersectionObserver that a test drives by
// hand with intersect(), since there is no layout to compute one from.

const body = new FakeElement('body');

type MutationCallback = (records: { addedNodes: unknown[]; removedNodes: unknown[] }[]) => void;
const mutationObservers = new Set<FakeMutationObserver>();

class FakeMutationObserver {
  private readonly callback: MutationCallback;
  constructor(callback: MutationCallback) {
    this.callback = callback;
  }
  observe(): void {
    mutationObservers.add(this);
  }
  disconnect(): void {
    mutationObservers.delete(this);
  }
  notify(added: FakeElement[], removed: FakeElement[]): void {
    this.callback([{ addedNodes: added, removedNodes: removed }]);
  }
}

type IntersectCallback = (entries: { target: unknown; isIntersecting: boolean; intersectionRatio: number }[]) => void;
const intersectionObservers = new Set<FakeIntersectionObserver>();

class FakeIntersectionObserver {
  readonly targets = new Set<FakeElement>();
  private readonly callback: IntersectCallback;
  constructor(callback: IntersectCallback) {
    this.callback = callback;
    intersectionObservers.add(this);
  }
  observe(el: FakeElement): void {
    // A disconnected observer can observe again, as a real one can.
    intersectionObservers.add(this);
    this.targets.add(el);
  }
  unobserve(el: FakeElement): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
    intersectionObservers.delete(this);
  }
  fire(el: FakeElement, isIntersecting: boolean, ratio: number): void {
    if (!this.targets.has(el)) return;
    this.callback([{ target: el, isIntersecting, intersectionRatio: ratio }]);
  }
}

/** Put an element tree into the document, as a render would. */
export function mount(...elements: Element[]): void {
  const fakes = elements as unknown as FakeElement[];
  for (const el of fakes) body.append(el);
  for (const mo of Array.from(mutationObservers)) mo.notify(fakes, []);
}

/** Take elements out of the document, as a navigation away would. */
export function unmount(...elements: Element[]): void {
  const fakes = elements as unknown as FakeElement[];
  for (const el of fakes) {
    body.children = body.children.filter((c) => c !== el);
    el.parent = null;
  }
  for (const mo of Array.from(mutationObservers)) mo.notify([], fakes);
}

/** An IntersectionObserver entry for `el`, delivered to whoever watches it. */
export function intersect(el: Element, isIntersecting: boolean, ratio = isIntersecting ? 1 : 0): void {
  const fake = el as unknown as FakeElement;
  for (const io of Array.from(intersectionObservers)) io.fire(fake, isIntersecting, ratio);
}

/** Is `el` watched by any live IntersectionObserver? */
export function isObserved(el: Element): boolean {
  const fake = el as unknown as FakeElement;
  return [...intersectionObservers].some((io) => io.targets.has(fake));
}

/** Live observers, for asserting that a teardown really tore down. */
export function liveObservers(): { intersection: number; mutation: number } {
  return { intersection: intersectionObservers.size, mutation: mutationObservers.size };
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
  body,
  getElementById: (id: string): FakeElement | null => {
    for (const el of body.walk()) if (el.id === id) return el;
    return null;
  },
  querySelectorAll: (selector: string): FakeElement[] => {
    const parts = selector.split(',');
    return [...body.walk()].filter((el) => el !== body && parts.some((p) => matchesOne(el, p)));
  },
  addEventListener: (type: string, fn: Listener) => documentEvents.addEventListener(type, fn),
  removeEventListener: (type: string, fn: Listener) => documentEvents.removeEventListener(type, fn),
};

export const fakeWindow: Record<string, unknown> = {
  location: { pathname: '/', search: '', origin: 'http://localhost' },
  innerWidth: 1440,
  innerHeight: 900,
  scrollY: 0,
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
g.IntersectionObserver = FakeIntersectionObserver;
g.MutationObserver = FakeMutationObserver;

/** A capture-phase click on `target` at page coordinates (x, y). */
export function click(target: Element, x = 100, y = 100): void {
  documentEvents.dispatch('click', { target, pageX: x, pageY: y });
}

/** How many listeners of `type` the document holds, for teardown checks. */
export function documentListeners(type: string): number {
  return documentEvents.count(type);
}

/** How many listeners of `type` the window holds. */
export function windowListeners(type: string): number {
  return windowEvents.count(type);
}

/**
 * The tab going to the background or coming back. Fired at the document and
 * seen by the window too, as the real event bubbles there.
 */
export function setVisibility(state: 'visible' | 'hidden'): void {
  fakeDocument.visibilityState = state;
  documentEvents.dispatch('visibilitychange', {});
  windowEvents.dispatch('visibilitychange', {});
}

/** A window-level lifecycle event: `pagehide`, `pageshow`, `scroll`. */
export function fireWindow(type: string, event: Record<string, unknown> = {}): void {
  windowEvents.dispatch(type, event);
}

/** Back to a first-visit browser: empty storage, not opted out. */
export function resetBrowser(): void {
  local.clear();
  session.clear();
}

/** An empty page at `pathname`, as after a navigation with nothing rendered. */
export function resetDocument(pathname = '/'): void {
  for (const child of body.children) if (typeof child !== 'string') child.parent = null;
  body.children = [];
  (fakeWindow.location as { pathname: string }).pathname = pathname;
  fakeDocument.visibilityState = 'visible';
  fakeWindow.scrollY = 0;
  fakeDocument.documentElement.scrollHeight = 4000;
}
