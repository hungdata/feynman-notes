import mongoose from "mongoose";

const aiConversationSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true, maxlength: 255 },
    documentId: { type: String, required: true, maxlength: 128 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    mode: {
      type: String,
      enum: ["socratic", "explain", "quiz", "review"],
      default: "socratic",
    },
    scope: {
      type: String,
      enum: ["node", "branch", "map"],
      default: "node",
    },
    nodeId: { type: String, default: null, maxlength: 128 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

aiConversationSchema.index({ ownerId: 1, documentId: 1, lastMessageAt: -1 });

export default mongoose.model("AiConversation", aiConversationSchema);
