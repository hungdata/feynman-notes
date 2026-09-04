import mongoose from "mongoose";

const aiMessageSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true, maxlength: 255 },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiConversation",
      required: true,
      index: true,
    },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    referencedNodeIds: {
      type: [{ type: String, maxlength: 128 }],
      default: [],
    },
    usage: {
      inputTokens: { type: Number, min: 0, default: 0 },
      outputTokens: { type: Number, min: 0, default: 0 },
    },
  },
  { timestamps: true }
);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model("AiMessage", aiMessageSchema);
