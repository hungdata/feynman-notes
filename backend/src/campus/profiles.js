import crypto from "node:crypto";

export class CampusError extends Error {
  constructor(message, status = 400, code = "CAMPUS_INPUT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const validateProfile = (input) => {
  if (!input || typeof input.name !== "string") throw new CampusError("Nhập tên nhân vật từ 2 đến 20 ký tự.");
  const name = input.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if ([...name].length < 2 || [...name].length > 20 || !/^[\p{L}\p{N} _-]+$/u.test(name)) {
    throw new CampusError("Tên gồm 2–20 chữ cái, chữ số, khoảng trắng, dấu _ hoặc -.");
  }
  if (!["male", "female"].includes(input.gender)) throw new CampusError("Chọn nhân vật nam hoặc nữ.");
  return { name, nameKey: name.toLocaleLowerCase("vi"), gender: input.gender };
};

export const publicProfile = (item) => item ? { id: item.id, name: item.name, gender: item.gender } : null;
const duplicateName = () => new CampusError("Tên nhân vật đã có người sử dụng. Hãy chọn tên khác.", 409, "NAME_TAKEN");

/** A profile claim is persisted before the request succeeds, without an await
 * between checking the unique key and inserting it in the single server. */
export const fileProfiles = (collection) => ({
  async get(ownerId) { return publicProfile(collection.find((item) => item.ownerId === ownerId)); },
  async save(ownerId, data) {
    const taken = collection.find((item) => item.nameKey === data.nameKey && item.ownerId !== ownerId);
    if (taken) throw duplicateName();
    const previous = collection.all().slice();
    const timestamp = new Date().toISOString();
    const match = (item) => item.ownerId === ownerId;
    const record = collection.updateOne(match, (item) => ({ ...item, ...data, updatedAt: timestamp }))
      || collection.insert({ ownerId, id: crypto.randomUUID(), ...data, createdAt: timestamp, updatedAt: timestamp });
    try { collection.flushSync(); } catch {
      collection.items = previous;
      collection.dirty = false;
      throw new CampusError("Không lưu được nhân vật. Hãy thử lại.", 503, "PROFILE_STORAGE_UNAVAILABLE");
    }
    return publicProfile(record);
  },
});

/** Refuse profile writes if Mongo cannot enforce both unique constraints. */
export const mongoProfiles = (database) => {
  const indexed = new WeakMap();
  const ready = async () => {
    const db = database();
    let pending = indexed.get(db);
    if (!pending) {
      pending = Promise.all([
        db.collection("campus_profiles").createIndex({ ownerId: 1 }, { unique: true, name: "campus_owner_unique" }),
        db.collection("campus_profiles").createIndex({ nameKey: 1 }, { unique: true, name: "campus_name_unique" }),
      ]).catch(() => {
        indexed.delete(db);
        throw new CampusError("Chưa bật được kiểm tra tên duy nhất. Hãy thử lại sau.", 503, "PROFILE_STORAGE_UNAVAILABLE");
      });
      indexed.set(db, pending);
    }
    await pending;
    return db.collection("campus_profiles");
  };
  return {
    async get(ownerId) { return publicProfile(await database().collection("campus_profiles").findOne({ ownerId })); },
    async save(ownerId, data) {
      const collection = await ready();
      const timestamp = new Date().toISOString();
      try {
        await collection.updateOne({ ownerId }, {
          $set: { ...data, updatedAt: timestamp },
          $setOnInsert: { ownerId, id: crypto.randomUUID(), createdAt: timestamp },
        }, { upsert: true });
        return publicProfile(await collection.findOne({ ownerId }));
      } catch (error) {
        if (error.code === 11000) throw duplicateName();
        throw error;
      }
    },
  };
};
