import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { JsonCollection } from "./jsonCollection.js";
import { fileProfiles } from "../campus/profiles.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const now = () => new Date().toISOString();
const clone = (value) => (value == null ? value : structuredClone(value));
const ownerKey = (ownerId) => crypto.createHash("sha256").update(String(ownerId)).digest("hex").slice(0, 24);
const byDateDesc = (field) => (first, second) => String(second[field] || "").localeCompare(String(first[field] || ""));
const byDateAsc = (field) => (first, second) => String(first[field] || "").localeCompare(String(second[field] || ""));

/**
 * Zero-config storage: everything lives in `backend/data` as JSON files plus
 * one binary file per uploaded image. Ideal for running on your own computer;
 * use MongoDB (MONGODB_CONNECTION_STRING) for a hosted, multi-user deployment.
 */
export const createFileStore = (dataDir) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const collection = (name) => new JsonCollection(path.join(dataDir, `${name}.json`)).load();
  const mindMaps = collection("mindmaps");
  const tasks = collection("tasks");
  const assets = collection("assets");
  const conversations = collection("ai-conversations");
  const messages = collection("ai-messages");
  const courses = collection("courses");
  const courseSources = collection("course-sources");
  const courseProgress = collection("course-progress");
  const learners = collection("learners");
  const campusProfiles = collection("campus-profiles");
  const all = [mindMaps, tasks, assets, conversations, messages, courses, courseSources, courseProgress, learners, campusProfiles];

  // Generic owner + id documents used by the learning feature.
  const keyed = (target) => ({
    async get(ownerId, id) {
      return clone(target.find((item) => item.ownerId === ownerId && item.id === id)?.data ?? null);
    },
    async list(ownerId) {
      return clone(target.filter((item) => item.ownerId === ownerId).sort(byDateDesc("updatedAt")).map((item) => item.data));
    },
    async listByStatus(status) {
      return clone(target.filter((item) => item.status === status).map((item) => ({ ownerId: item.ownerId, data: item.data })));
    },
    async save(ownerId, id, data) {
      const timestamp = now();
      const status = String(data?.status || "");
      const match = (item) => item.ownerId === ownerId && item.id === id;
      const updated = target.updateOne(match, (item) => ({ ...item, status, data: clone(data), updatedAt: timestamp }));
      if (!updated) target.insert({ ownerId, id, status, data: clone(data), createdAt: timestamp, updatedAt: timestamp });
      return clone(data);
    },
    async remove(ownerId, id) {
      return target.removeWhere((item) => item.ownerId === ownerId && item.id === id).length > 0;
    },
  });
  const assetPath = (ownerId, assetId) => path.join(dataDir, "assets", ownerKey(ownerId), assetId);

  return {
    kind: "file",
    describe: () => `Tệp JSON trên máy (${dataDir})`,
    isValidId: (id) => UUID_PATTERN.test(String(id || "")),
    campusProfiles: fileProfiles(campusProfiles),

    mindMaps: {
      async list(ownerId) {
        return clone(mindMaps.filter((item) => item.ownerId === ownerId).sort(byDateDesc("updatedAt")));
      },
      async get(ownerId, documentId) {
        return clone(mindMaps.find((item) => item.ownerId === ownerId && item.documentId === documentId));
      },
      async save(ownerId, documentId, document) {
        const timestamp = now();
        const title = String(document.title || "Mind map").slice(0, 200);
        const match = (item) => item.ownerId === ownerId && item.documentId === documentId;
        const updated = mindMaps.updateOne(match, (item) => ({ ...item, title, document: clone(document), updatedAt: timestamp }));
        return clone(updated || mindMaps.insert({ ownerId, documentId, title, document: clone(document), createdAt: timestamp, updatedAt: timestamp }));
      },
      async remove(ownerId, documentId) {
        return mindMaps.removeWhere((item) => item.ownerId === ownerId && item.documentId === documentId).length > 0;
      },
      async referencesAsset(ownerId, assetId) {
        return mindMaps.all().some((item) => item.ownerId === ownerId && (item.document?.nodes || [])
          .some((node) => node?.data?.assetId === assetId || node?.data?.imageAssetId === assetId));
      },
    },

    tasks: {
      async list(ownerId) {
        const owned = tasks.filter((task) => task.ownerId === ownerId).sort(byDateDesc("createdAt"));
        return {
          tasks: clone(owned),
          activeCount: owned.filter((task) => task.status === "active").length,
          completedCount: owned.filter((task) => task.status === "completed").length,
        };
      },
      async create(ownerId, { title }) {
        const timestamp = now();
        return clone(tasks.insert({ _id: crypto.randomUUID(), ownerId, title, status: "active", completedAt: null, createdAt: timestamp, updatedAt: timestamp }));
      },
      async update(ownerId, id, updates) {
        return clone(tasks.updateOne((task) => task._id === id && task.ownerId === ownerId, (task) => ({ ...task, ...updates, updatedAt: now() })));
      },
      async remove(ownerId, id) {
        return clone(tasks.removeWhere((task) => task._id === id && task.ownerId === ownerId)[0] || null);
      },
    },

    assets: {
      async find(ownerId, assetId) {
        const file = assets.find((item) => item.metadata.ownerId === ownerId && item.metadata.assetId === assetId);
        return file ? { ...clone(file), uploadDate: new Date(file.uploadDate) } : null;
      },
      async save(ownerId, assetId, buffer, metadata) {
        const existing = await this.find(ownerId, assetId);
        if (existing) return { file: existing, reused: true };
        const target = assetPath(ownerId, assetId);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, buffer);
        const file = assets.insert({
          _id: crypto.randomUUID(),
          filename: metadata.originalName,
          contentType: metadata.mimeType,
          length: buffer.length,
          uploadDate: now(),
          metadata: { ...metadata, ownerId, assetId },
        });
        return { file: { ...clone(file), uploadDate: new Date(file.uploadDate) }, reused: false };
      },
      openReadStream(file) {
        return fs.createReadStream(assetPath(file.metadata.ownerId, file.metadata.assetId));
      },
      async remove(file) {
        assets.removeWhere((item) => item._id === file._id);
        await fsp.rm(assetPath(file.metadata.ownerId, file.metadata.assetId), { force: true });
      },
    },

    ai: {
      async listConversations(ownerId, documentId, limit = 50) {
        return clone(conversations.filter((item) => item.ownerId === ownerId && item.documentId === documentId)
          .sort(byDateDesc("lastMessageAt")).slice(0, limit));
      },
      async getConversation(ownerId, id, documentId = null) {
        return clone(conversations.find((item) => item._id === id && item.ownerId === ownerId
          && (!documentId || item.documentId === documentId)));
      },
      async createConversation(data) {
        const timestamp = now();
        return clone(conversations.insert({ _id: crypto.randomUUID(), nodeId: null, ...data, lastMessageAt: timestamp, createdAt: timestamp, updatedAt: timestamp }));
      },
      async updateConversation(ownerId, id, updates) {
        return clone(conversations.updateOne((item) => item._id === id && item.ownerId === ownerId, (item) => ({ ...item, ...updates, updatedAt: now() })));
      },
      async deleteConversation(ownerId, id) {
        const [removed] = conversations.removeWhere((item) => item._id === id && item.ownerId === ownerId);
        if (removed) messages.removeWhere((message) => message.conversationId === id && message.ownerId === ownerId);
        return clone(removed || null);
      },
      async listMessages(ownerId, conversationId, { limit = 200, newestFirst = false } = {}) {
        const owned = messages.filter((message) => message.ownerId === ownerId && message.conversationId === conversationId);
        const sorted = owned.sort(newestFirst ? byDateDesc("createdAt") : byDateAsc("createdAt"));
        return clone(sorted.slice(0, limit));
      },
      async addMessages(ownerId, conversationId, items) {
        const base = Date.now();
        return items.map((item, index) => clone(messages.insert({
          _id: crypto.randomUUID(),
          ownerId,
          conversationId,
          referencedNodeIds: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          ...item,
          // Keep a stable order for messages saved in the same millisecond.
          createdAt: new Date(base + index).toISOString(),
          updatedAt: new Date(base + index).toISOString(),
        })));
      },
    },

    courses: keyed(courses),
    courseSources: keyed(courseSources),
    courseProgress: keyed(courseProgress),
    learners: keyed(learners),

    async flush() { await Promise.all(all.map((item) => item.flush())); },
    flushSync() { all.forEach((item) => item.flushSync()); },
  };
};
