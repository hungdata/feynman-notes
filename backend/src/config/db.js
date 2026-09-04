import mongoose from "mongoose";

export const connectDB = async () => {
  const connectionString = process.env.MONGODB_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error("MONGODB_CONNECTION_STRING is not configured");
  }

  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10_000,
  });

  // GridFS stores the binary file separately from the mind-map JSON. The
  // compound ownership index makes a browser retry with the same asset UUID
  // idempotent and prevents one account from creating duplicate asset records.
  try {
    await mongoose.connection.db.collection("mindmap_assets.files").createIndex(
      { "metadata.ownerId": 1, "metadata.assetId": 1 },
      {
        unique: true,
        partialFilterExpression: { "metadata.assetId": { $type: "string" } },
        name: "owner_asset_id_unique",
      }
    );
  } catch (error) {
    // A restricted production database role should not take the whole notes
    // API down. Uploads still perform a lookup first; only simultaneous
    // duplicate retries lose the database-level uniqueness guard.
    console.warn("Unable to create GridFS asset index:", error.message);
  }

  console.log("MongoDB connected");
};
