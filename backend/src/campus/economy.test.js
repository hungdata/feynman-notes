import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buyRod, dropCast, finishCast, getWallet, rewardLesson, startCast, withEconomyOwner } from "./economy.js";
import { createFileStore } from "../storage/fileStore.js";
import { setStore } from "../storage/index.js";

const setup = (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "campus-economy-"));
  const store = setStore(createFileStore(dataDir));
  t.after(async () => {
    await store.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir };
};
const hasCode = (code) => (error) => error.code === code;

test("a cast pays only once, after the bite and minimum reel time, to its own owner", async (t) => {
  setup(t);
  const cast = await startCast("one", { now: 1000, random: () => 0.2 });
  assert.equal(cast.fish, undefined, "the browser cannot choose or replace the fish");
  assert.equal(cast.gold, undefined);
  await assert.rejects(finishCast("one", cast.castId, { now: 1000 + cast.biteIn + 1199 }), hasCode("TOO_EARLY"));
  assert.equal((await getWallet("one")).gold, 0);
  await assert.rejects(finishCast("two", cast.castId, { now: 1000 + cast.biteIn + 1200 }), hasCode("CAST_UNKNOWN"));
  const results = await Promise.allSettled([
    finishCast("one", cast.castId, { now: 1000 + cast.biteIn + 1200 }),
    finishCast("one", cast.castId, { now: 1000 + cast.biteIn + 1200 }),
  ]);
  const catchResult = results.find((result) => result.status === "fulfilled").value;
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "CAST_UNKNOWN");
  assert.equal(catchResult.wallet.gold, catchResult.fish.gold);
  assert.equal(catchResult.wallet.caught, 1);
  assert.deepEqual(catchResult.wallet.fish[catchResult.fish.id], { count: 1, best: catchResult.fish.size });
  assert.equal((await getWallet("two")).caught, 0);
});

test("a new cast recovers abandoned lines; stale catch and release cannot affect it", async (t) => {
  setup(t);
  const [first, second] = await Promise.all([startCast("one", { now: 1000 }), startCast("one", { now: 2000 })]);
  assert.notEqual(first.castId, second.castId);
  await assert.rejects(finishCast("one", first.castId, { now: 2000 + second.biteIn + 1200 }), hasCode("CAST_UNKNOWN"));
  await dropCast("one", first.castId);
  await dropCast("one", "");
  await dropCast("two", second.castId);
  const caught = await finishCast("one", second.castId, { now: 2000 + second.biteIn + 1200 });
  assert.equal(caught.wallet.caught, 1);
  const expired = await startCast("one", { now: 100_000 });
  await assert.rejects(finishCast("one", expired.castId, { now: 100_000 + expired.biteIn + 60_001 }), hasCode("TOO_LATE"));
  await assert.rejects(finishCast("one", expired.castId, { now: 100_000 + expired.biteIn + 60_002 }), hasCode("CAST_UNKNOWN"));
  assert.equal((await getWallet("one")).caught, 1);
});

test("server rod prices, ownership and equip survive concurrent purchases and reload", async (t) => {
  const { store, dataDir } = setup(t);
  await assert.rejects(buyRod("one", "carbon"), hasCode("GOLD_SHORT"));
  await assert.rejects(buyRod("one", "invented"), hasCode("ROD_UNKNOWN"));
  await store.learners.save("one", "wallet", { gold: 150, rods: ["bamboo"], rod: "bamboo", caught: 0, fish: {} });
  await Promise.all([buyRod("one", "oak"), buyRod("one", "oak")]);
  assert.deepEqual(await getWallet("one"), { gold: 0, rod: "oak", rods: ["bamboo", "oak"], caught: 0, fish: {} });
  await buyRod("one", "bamboo");
  assert.equal((await buyRod("one", "oak")).wallet.gold, 0, "equipping an owned rod is free");
  await assert.rejects(buyRod("two", "oak"), hasCode("GOLD_SHORT"));
  await store.flush();
  setStore(createFileStore(dataDir));
  assert.equal((await getWallet("one")).rod, "oak");
  assert.deepEqual((await getWallet("two")).rods, ["bamboo"]);
});

test("a lost storage acknowledgement cannot pay the same catch twice", async (t) => {
  const { store } = setup(t);
  const cast = await startCast("one", { now: 1000, random: () => 0.2 });
  const save = store.learners.save;
  let first = true;
  store.learners.save = async (...args) => {
    const result = await save(...args);
    if (first) { first = false; throw new Error("acknowledgement lost"); }
    return result;
  };
  await assert.rejects(finishCast("one", cast.castId, { now: 1000 + cast.biteIn + 1200 }), /acknowledgement lost/);
  await assert.rejects(finishCast("one", cast.castId, { now: 1000 + cast.biteIn + 1201 }), hasCode("CAST_UNKNOWN"));
  assert.equal((await getWallet("one")).caught, 1);
});

test("lesson reward ledger persists, isolates owners and never appears in the public wallet", async (t) => {
  const { store, dataDir } = setup(t);
  const reward = (owner) => withEconomyOwner(owner, (activeStore) => rewardLesson(activeStore, owner, "course", "lesson", true));
  assert.deepEqual(await Promise.all([reward("one"), reward("one"), reward("two")]), [10, 0, 10]);
  assert.equal((await getWallet("one")).lessonRewards, undefined);
  await store.flush();
  setStore(createFileStore(dataDir));
  assert.equal(await reward("one"), 0);
  assert.equal((await getWallet("one")).gold, 10);
});
