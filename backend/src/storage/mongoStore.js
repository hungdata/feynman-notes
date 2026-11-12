import { Readable } from "node:stream";
import mongoose from "mongoose";
import MindMap from "../models/mindMap.js";
import Task from "../models/tasks.js";
import AiConversation from "../models/aiConversation.js";
import AiMessage from "../models/aiMessage.js";
import { Course, CourseProgress, CourseSource, Learner } from "../models/learning.js";
import { mongoProfiles } from "../campus/profiles.js";

const keyed = (Model) => ({
  get: async (ownerId, id) => (await Model.findOne({ ownerId, itemId: id }).lean())?.data ?? null,
  list: async (ownerId) => (await Model.find({ ownerId }).sort({ updatedAt: -1 }).lean()).map((item) => item.data),
  listByStatus: async (status) => (await Model.find({ status }).lean()).map((item) => ({ ownerId: item.ownerId, data: item.data })),
  save: async (ownerId, id, data) => {
    await Model.findOneAndUpdate({ ownerId, itemId: id }, { ownerId, itemId: id, status: String(data?.status || ""), data }, { upsert: true, new: true });
    return data;
  },
  remove: async (ownerId, id) => (await Model.deleteOne({ ownerId, itemId: id })).deletedCount > 0,
});

export const ASSET_BUCKET_NAME = "mindmap_assets";
const FILES_COLLECTION = `${ASSET_BUCKET_NAME}.files`;

export class StorageUnavailableError extends Error {
  constructor(message = "Cơ sở dữ liệu tạm thời chưa sẵn sàng. Vui lòng thử lại sau ít giây.") {
    super(message);
    this.name = "StorageUnavailableError";
    this.status = 503;
    this.code = "STORAGE_UNAVAILABLE";
  }
}

const database = () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new StorageUnavailableError();
  return mongoose.connection.db;
};
const bucket = () => new mongoose.mongo.GridFSBucket(database(), { bucketName: ASSET_BUCKET_NAME });

const writeBufferToGridFs = (gridFsBucket, buffer, options) => new Promise((resolve, reject) => {
  const uploadStream = gridFsBucket.openUploadStream(options.filename, options);
  let settled = false;
  const finish = (callback) => (value) => {
    if (settled) return;
    settled = true;
    callback(value);
  };
  uploadStream.once("finish", finish(() => resolve(uploadStream.id)));
  const fail = finish((error) => { error.gridFsFileId = uploadStream.id; reject(error); });
  uploadStream.once("error", fail);
  const source = Readable.from([buffer]);
  source.once("error", fail);
  source.pipe(uploadStream);
});

/** MongoDB storage used for hosted deployments (MongoDB Atlas, etc.). */
export const createMongoStore = () => {
  const findAsset = (ownerId, assetId) => database().collection(FILES_COLLECTION).findOne({
    "metadata.ownerId": ownerId,
    "metadata.assetId": assetId,
  });

  return {
    kind: "mongo",
    describe: () => "MongoDB",
    isValidId: (id) => mongoose.isValidObjectId(String(id || "")),
    campusProfiles: mongoProfiles(database),

    mindMaps: {
      list: (ownerId) => MindMap.find({ ownerId }).sort({ updatedAt: -1 }).lean(),
      get: (ownerId, documentId) => MindMap.findOne({ ownerId, documentId }).lean(),
      save: (ownerId, documentId, document) => MindMap.findOneAndUpdate(
        { ownerId, documentId },
        { ownerId, documentId, title: String(document.title || "Mind map").slice(0, 200), document },
        { upsert: true, new: true, runValidators: true }
      ).lean(),
      remove: async (ownerId, documentId) => (await MindMap.deleteOne({ ownerId, documentId })).deletedCount > 0,
      referencesAsset: async (ownerId, assetId) => Boolean(await MindMap.exists({
        ownerId,
        $or: [{ "document.nodes.data.assetId": assetId }, { "document.nodes.data.imageAssetId": assetId }],
      })),
    },

    tasks: {
      async list(ownerId) {
        const [result] = await Task.aggregate([
          { $match: { ownerId } },
          {
            $facet: {
              tasks: [{ $sort: { createdAt: -1 } }],
              activeCount: [{ $match: { status: "active" } }, { $count: "count" }],
              completedCount: [{ $match: { status: "completed" } }, { $count: "count" }],
            },
          },
        ]);
        return {
          tasks: result.tasks,
          activeCount: result.activeCount[0]?.count ?? 0,
          completedCount: result.completedCount[0]?.count ?? 0,
        };
      },
      create: (ownerId, { title }) => Task.create({ title, ownerId }),
      update: (ownerId, id, updates) => Task.findOneAndUpdate({ _id: id, ownerId }, updates, { new: true, runValidators: true }),
      remove: (ownerId, id) => Task.findOneAndDelete({ _id: id, ownerId }),
    },

    assets: {
      find: (ownerId, assetId) => findAsset(ownerId, assetId),
      async save(ownerId, assetId, buffer, metadata) {
        const existing = await findAsset(ownerId, assetId);
        if (existing) return { file: existing, reused: true };
        let fileId;
        try {
          fileId = await writeBufferToGridFs(bucket(), buffer, {
            filename: metadata.originalName,
            contentType: metadata.mimeType,
            metadata: { ...metadata, ownerId, assetId },
          });
        } catch (error) {
          // A unique index may reject a concurrent upload with the same UUID.
          if (error?.code === 11000) {
            const raced = await findAsset(ownerId, assetId);
            if (raced) return { file: raced, reused: true };
          }
          if (error?.gridFsFileId) {
            try { await bucket().delete(error.gridFsFileId); } catch { /* best-effort cleanup */ }
          }
          throw error;
        }
        const file = await database().collection(FILES_COLLECTION).findOne({ _id: fileId });
        if (!file) throw new Error("Không thể lưu ảnh.");
        return { file, reused: false };
      },
      openReadStream: (file) => bucket().openDownloadStream(file._id),
      remove: (file) => bucket().delete(file._id),
    },

    ai: {
      listConversations: (ownerId, documentId, limit = 50) => AiConversation.find({ ownerId, documentId })
        .sort({ lastMessageAt: -1 }).limit(limit).lean(),
      getConversation: (ownerId, id, documentId = null) => AiConversation.findOne({
        _id: id, ownerId, ...(documentId ? { documentId } : {}),
      }).lean(),
      createConversation: async (data) => (await AiConversation.create(data)).toObject(),
      updateConversation: (ownerId, id, updates) => AiConversation.findOneAndUpdate({ _id: id, ownerId }, updates, { new: true }).lean(),
      async deleteConversation(ownerId, id) {
        const removed = await AiConversation.findOneAndDelete({ _id: id, ownerId }).lean();
        if (removed) await AiMessage.deleteMany({ ownerId, conversationId: removed._id });
        return removed;
      },
      listMessages: (ownerId, conversationId, { limit = 200, newestFirst = false } = {}) => AiMessage.find({ ownerId, conversationId })
        .sort({ createdAt: newestFirst ? -1 : 1 }).limit(limit).lean(),
      addMessages: async (ownerId, conversationId, items) => (await AiMessage.insertMany(
        items.map((item) => ({ ...item, ownerId, conversationId }))
      )).map((item) => item.toObject()),
    },

    courses: keyed(Course),
    courseSources: keyed(CourseSource),
    courseProgress: keyed(CourseProgress),
    learners: keyed(Learner),

    async flush() {},
    flushSync() {},
  };
};
