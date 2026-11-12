import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * A tiny JSON-file collection for the zero-config local storage.
 *
 * The whole collection lives in memory and is flushed to disk shortly after a
 * change. Writes go to a temporary file first and are then renamed over the
 * old file, so a crash can never leave half-written JSON behind.
 */
export class JsonCollection {
  constructor(filePath, { flushDelayMs = 120 } = {}) {
    this.filePath = filePath;
    this.flushDelayMs = flushDelayMs;
    this.items = [];
    this.timer = null;
    this.writing = Promise.resolve();
    this.dirty = false;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code !== "ENOENT") {
        // Keep the unreadable file for manual recovery instead of overwriting it.
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try { fs.copyFileSync(this.filePath, backup); } catch { /* best effort */ }
        console.warn(`[storage] ${path.basename(this.filePath)} không đọc được, đã sao lưu sang ${path.basename(backup)}.`);
      }
      this.items = [];
    }
    return this;
  }

  all() { return this.items; }
  find(predicate) { return this.items.find(predicate) || null; }
  filter(predicate) { return this.items.filter(predicate); }

  insert(item) {
    this.items.push(item);
    this.changed();
    return item;
  }

  /** Applies `update` to the first matching item and returns the new item. */
  updateOne(predicate, update) {
    const index = this.items.findIndex(predicate);
    if (index < 0) return null;
    const next = typeof update === "function" ? update(this.items[index]) : { ...this.items[index], ...update };
    this.items[index] = next;
    this.changed();
    return next;
  }

  removeWhere(predicate) {
    const before = this.items.length;
    const removed = this.items.filter(predicate);
    this.items = this.items.filter((item) => !predicate(item));
    if (this.items.length !== before) this.changed();
    return removed;
  }

  changed() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushDelayMs);
    this.timer.unref?.();
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return this.writing;
    this.dirty = false;
    const snapshot = JSON.stringify(this.items);
    this.writing = this.writing.then(async () => {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await fsp.writeFile(temporary, snapshot, "utf8");
      await fsp.rename(temporary, this.filePath);
    }).catch((error) => {
      this.dirty = true;
      console.error(`[storage] Không thể ghi ${path.basename(this.filePath)}:`, error.message);
    });
    return this.writing;
  }

  /** Synchronous last-chance write used on process exit. */
  flushSync() {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.items), "utf8");
    fs.renameSync(temporary, this.filePath);
    this.dirty = false;
  }
}
