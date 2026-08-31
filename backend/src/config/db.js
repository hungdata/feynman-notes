import mongoose from "mongoose";

export const connectDB = async () => {
  const connectionString = process.env.MONGODB_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error("MONGODB_CONNECTION_STRING is not configured");
  }

  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10_000,
  });

  console.log("MongoDB connected");
};
