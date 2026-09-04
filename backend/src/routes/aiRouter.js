import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth/requireAuth.js";
import { buildTeacherContext } from "../ai/teacherContext.js";
import { buildTeacherSystemPrompt, VALID_TEACHER_MODES } from "../ai/teacherPrompt.js";
import {
  AiProviderError,
  assertCloudflareAiAvailable,
  getCloudflareAiAvailability,
  runCloudflareModel,
} from "../ai/providers/cloudflareProvider.js";
import AiConversation from "../models/aiConversation.js";
import AiMessage from "../models/aiMessage.js";
import MindMap from "../models/mindMap.js";

const router = express.Router();
const VALID_SCOPES = new Set(["node", "branch", "map"]);
const MAX_USER_MESSAGE_LENGTH = 2_000;
const HISTORY_LIMIT = 12;

const normalizeOptionalId = (value) => {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, 128) || null;
};

export const normalizeTeacherRequest = (body = {}) => {
  const documentId = normalizeOptionalId(body.documentId);
  const conversationId = normalizeOptionalId(body.conversationId);
  const nodeId = normalizeOptionalId(body.nodeId);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode : "socratic";
  const scope = typeof body.scope === "string" ? body.scope : "node";

  if (!documentId) throw new Error("Thiếu mind map cần học.");
  if (!message) throw new Error("Hãy nhập câu hỏi cho AI Teacher.");
  if (message.length > MAX_USER_MESSAGE_LENGTH) {
    throw new Error("Câu hỏi không được vượt quá 2.000 ký tự.");
  }
  if (!VALID_TEACHER_MODES.has(mode)) throw new Error("Chế độ AI Teacher không hợp lệ.");
  if (!VALID_SCOPES.has(scope)) throw new Error("Phạm vi AI Teacher không hợp lệ.");
  if (scope !== "map" && !nodeId) throw new Error("Hãy chọn một node để AI Teacher phân tích.");
  if (conversationId && !mongoose.isValidObjectId(conversationId)) {
    throw new Error("Mã cuộc hội thoại không hợp lệ.");
  }

  return { documentId, conversationId, nodeId, message, mode, scope };
};

export const ownedConversationFilter = (ownerId, conversationId, documentId) => ({
  _id: conversationId,
  ownerId: String(ownerId),
  ...(documentId ? { documentId: String(documentId) } : {}),
});

export const createAiRateLimiter = ({ limit = 10, windowMs = 60_000 } = {}) => {
  const attempts = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.user?.id || "anonymous");
    const active = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (active.length >= limit) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1_000)));
      return res.status(429).json({
        message: "Bạn đang gửi câu hỏi quá nhanh. Vui lòng chờ một phút rồi thử lại.",
        code: "AI_LOCAL_RATE_LIMITED",
      });
    }

    active.push(now);
    attempts.set(key, active);
    next();
  };
};

const configuredRateLimit = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10) || 10, 60)
);

router.use(requireAuth);

router.get("/status", (_req, res) => {
  res.json(getCloudflareAiAvailability());
});

router.get("/conversations", async (req, res, next) => {
  try {
    const documentId = normalizeOptionalId(req.query.documentId);
    if (!documentId) return res.status(400).json({ message: "Thiếu mind map cần tải hội thoại." });

    const conversations = await AiConversation.find({ ownerId: req.user.id, documentId })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations/:conversationId/messages", async (req, res, next) => {
  try {
    const conversationId = String(req.params.conversationId);
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Mã cuộc hội thoại không hợp lệ." });
    }

    const conversation = await AiConversation.findOne(
      ownedConversationFilter(req.user.id, conversationId)
    ).lean();
    if (!conversation) return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });

    const messages = await AiMessage.find({
      ownerId: req.user.id,
      conversationId: conversation._id,
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

router.delete("/conversations/:conversationId", async (req, res, next) => {
  try {
    const conversationId = String(req.params.conversationId);
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Mã cuộc hội thoại không hợp lệ." });
    }

    const conversation = await AiConversation.findOneAndDelete(
      ownedConversationFilter(req.user.id, conversationId)
    ).lean();
    if (!conversation) return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });

    await AiMessage.deleteMany({ ownerId: req.user.id, conversationId: conversation._id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

const requireAiAvailability = (_req, res, next) => {
  try {
    assertCloudflareAiAvailable();
    next();
  } catch (error) {
    if (!(error instanceof AiProviderError)) return next(error);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(error.retryAt).getTime() - Date.now()) / 1_000)
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      retryAt: error.retryAt,
    });
  }
};

router.post(
  "/chat",
  requireAiAvailability,
  createAiRateLimiter({ limit: configuredRateLimit }),
  async (req, res, next) => {
    let input;
    try {
      input = normalizeTeacherRequest(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const mindMap = await MindMap.findOne({
        ownerId: req.user.id,
        documentId: input.documentId,
      }).lean();
      if (!mindMap) return res.status(404).json({ message: "Không tìm thấy mind map." });

      // Validate and build context before creating any database records so an
      // invalid/missing node cannot leave behind an empty conversation.
      const teacherContext = buildTeacherContext(mindMap.document, {
        scope: input.scope,
        nodeId: input.nodeId,
        selectedOnly: ["verify", "explain", "debate"].includes(input.mode),
      });

      let conversation = null;
      const isNewConversation = !input.conversationId;
      if (input.conversationId) {
        conversation = await AiConversation.findOne(
          ownedConversationFilter(req.user.id, input.conversationId, input.documentId)
        );
        if (!conversation) {
          return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });
        }
      }

      const recentMessages = conversation
        ? await AiMessage.find({
            ownerId: req.user.id,
            conversationId: conversation._id,
          })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .lean()
        : [];

      const providerMessages = [
        {
          role: "system",
          content: buildTeacherSystemPrompt({
            mode: input.mode,
            scope: input.scope,
            context: teacherContext.text,
          }),
        },
        ...recentMessages.reverse().map(({ role, content }) => ({ role, content })),
        { role: "user", content: input.message },
      ];

      const answer = await runCloudflareModel({ messages: providerMessages });
      if (!answer.content) {
        throw new AiProviderError("AI Teacher không tạo được câu trả lời.", {
          status: 502,
          code: "AI_EMPTY_RESPONSE",
        });
      }

      if (!conversation) {
        conversation = await AiConversation.create({
          ownerId: req.user.id,
          documentId: input.documentId,
          title: input.message.slice(0, 80),
          mode: input.mode,
          scope: input.scope,
          nodeId: input.nodeId,
        });
      }

      const [, assistantMessage] = await AiMessage.insertMany([
        {
          ownerId: req.user.id,
          conversationId: conversation._id,
          role: "user",
          content: input.message,
          referencedNodeIds: teacherContext.referencedNodeIds,
        },
        {
          ownerId: req.user.id,
          conversationId: conversation._id,
          role: "assistant",
          content: answer.content,
          referencedNodeIds: teacherContext.referencedNodeIds,
          usage: answer.usage,
        },
      ]);

      conversation.mode = input.mode;
      conversation.scope = input.scope;
      conversation.nodeId = input.nodeId;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      res.status(isNewConversation ? 201 : 200).json({
        conversation,
        message: assistantMessage,
        model: answer.model,
      });
    } catch (error) {
      if (error instanceof AiProviderError) {
        if (error.retryAt) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((new Date(error.retryAt).getTime() - Date.now()) / 1_000)
          );
          res.setHeader("Retry-After", String(retryAfterSeconds));
        }
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
          ...(error.retryAt ? { retryAt: error.retryAt } : {}),
        });
      }
      if (error?.message?.includes("node") || error?.message?.includes("Phạm vi")) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
);

export default router;
