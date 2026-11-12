import test from "node:test";
import assert from "node:assert/strict";
import { createProfileCache } from "./profileCache.js";

test("concurrent movement packets share one profile query, isolated by owner", async () => {
  let reads = 0;
  const cache = createProfileCache({ load: async (id) => { reads += 1; return { id, name: id, gender: "female" }; } });
  const profiles = await Promise.all(Array.from({ length: 100 }, () => cache.get("google:a")));
  assert.equal(reads, 1);
  assert.ok(profiles.every((profile) => profile.id === "google:a"));
  assert.equal((await cache.get("guest:b")).id, "guest:b");
  assert.equal(reads, 2);
  await cache.get("google:a");
  assert.equal(reads, 2);
});

test("expiry reloads profiles and missing profiles have a short negative cache", async () => {
  let timestamp = 0;
  let profile = null;
  let reads = 0;
  const cache = createProfileCache({ now: () => timestamp, load: async () => { reads += 1; return profile; } });
  assert.equal(await cache.get("one"), null);
  assert.equal(await cache.get("one"), null);
  assert.equal(reads, 1);
  profile = { id: "avatar", name: "Mây", gender: "female" };
  timestamp = 1000;
  assert.equal((await cache.get("one")).name, "Mây");
  timestamp = 30_999;
  await cache.get("one");
  assert.equal(reads, 2);
  timestamp = 31_000;
  await cache.get("one");
  assert.equal(reads, 3);
});

test("a completed profile change cannot be overwritten by an older pending read", async () => {
  let finish;
  const cache = createProfileCache({ load: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = cache.get("one");
  await Promise.resolve();
  cache.remember("one", { id: "avatar", name: "Tên mới", gender: "male" });
  finish({ id: "avatar", name: "Tên cũ", gender: "female" });
  assert.equal((await pending).name, "Tên mới");
  assert.equal((await cache.get("one")).name, "Tên mới");
});

test("storage errors remain visible and are retried instead of cached", async () => {
  let reads = 0;
  const cache = createProfileCache({ load: async () => { if (++reads === 1) throw new Error("database unavailable"); return { id: "avatar" }; } });
  await assert.rejects(cache.get("one"), /database unavailable/);
  assert.equal((await cache.get("one")).id, "avatar");
  assert.equal(reads, 2);
});

test("cached owners are bounded even when many different accounts make requests", async () => {
  let reads = 0;
  const cache = createProfileCache({ limit: 3, load: async (id) => { reads += 1; return { id }; } });
  for (const id of ["one", "two", "three", "four"]) await cache.get(id);
  await cache.get("four");
  assert.equal(reads, 4);
  await cache.get("one");
  assert.equal(reads, 5, "old owners are evicted");
});
