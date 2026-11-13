import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers";
import { openRoom } from "./online.js";

const original = { fetch: globalThis.fetch, EventSource: globalThis.EventSource, performance: Object.getOwnPropertyDescriptor(globalThis, "performance") };
let links = [];
afterEach(() => {
  for (const link of links) link.close();
  links = [];
  globalThis.fetch = original.fetch;
  globalThis.EventSource = original.EventSource;
  Object.defineProperty(globalThis, "performance", original.performance);
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (status = 200, data = {}) => ({ ok: status < 400, status, json: async () => data });
const setup = (fetch) => {
  let time = 1000;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => time } });
  const sources = [];
  globalThis.EventSource = class {
    constructor() { this.listeners = new Map(); this.closed = false; sources.push(this); }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    close() { this.closed = true; }
    emit(name, data = {}) { this.listeners.get(name)?.({ data: JSON.stringify(data) }); }
  };
  globalThis.fetch = fetch;
  return { sources, at: (value) => { time = value; }, open: (handlers = {}) => { const link = openRoom("ABCDE", handlers); links.push(link); return link; } };
};

test("the newest input replaces a throttled older value without sending it afterward", async () => {
  const calls = [];
  const pending = [];
  const env = setup((_url, options) => {
    calls.push(JSON.parse(options.body).mx);
    return new Promise((resolve) => pending.push(resolve));
  });
  const link = env.open();
  link.input({ mx: 1 });
  pending.shift()(response());
  await settle();
  env.at(1010); link.input({ mx: 0 });
  env.at(1050); link.input({ mx: -1 });
  pending.shift()(response());
  await settle();
  assert.deepEqual(calls, [1, -1]);
  env.at(1060); link.input({ mx: -1 });
  assert.deepEqual(calls, [1, -1], "unchanged input waits for its heartbeat");
});

test("closing a room aborts its active request and discards queued inputs and actions", async () => {
  const calls = [];
  const env = setup((_url, options) => {
    calls.push(options);
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })), { once: true }));
  });
  const link = env.open();
  link.input({ mx: 1 });
  env.at(1060); link.input({ mx: 0 });
  link.close();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(env.sources[0].closed, true);
  assert.equal(link.action("short"), false);
  link.input({ mx: -1 });
  assert.equal(calls.length, 1);
});

test("a missing room after SSE failure reports one terminal error and ignores stale events", async () => {
  const calls = [];
  const errors = [];
  const connections = [];
  let states = 0;
  const env = setup(async (url, options) => { calls.push({ url, method: options.method }); return response(404, { code: "FOOTBALL_ROOM_NOT_FOUND", message: "Phòng không còn tồn tại." }); });
  const link = env.open({ onError: (error) => errors.push(error), onConnection: (state) => connections.push(state), onState: () => { states += 1; } });
  env.sources[0].emit("error");
  await settle();
  assert.deepEqual(calls, [{ url: "/api/football/rooms/ABCDE", method: "GET" }]);
  assert.deepEqual(connections, ["connecting", "reconnecting", "disconnected"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].status, 404);
  env.sources[0].emit("state", { c: 30 });
  env.sources[0].emit("error");
  assert.equal(states, 0);
  assert.equal(link.action("shoot"), false);
  assert.equal(calls.length, 1);
});
