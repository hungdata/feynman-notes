import mongoose from "mongoose";

const mindMapSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true, maxlength: 255 },
  documentId: { type: String, required: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  document: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

mindMapSchema.index({ ownerId: 1, documentId: 1 }, { unique: true });

export default mongoose.model("MindMap", mindMapSchema);
