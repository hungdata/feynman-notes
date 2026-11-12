import express from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { buildTeacherContext } from "../ai/teacherContext.js";
import { buildTeacherSystemPrompt, VALID_TEACHER_MODES, WEB_RAG_MODES } from "../ai/teacherPrompt.js";
import {
  AiProviderError,
  assertCloudflareAiAvailable,
  getCloudflareAiAvailability,
} from "../ai/providers/cloudflareProvider.js";
import { activeProvider, AiRequestError, describeAi, isAiConfigured, runTeacherModel } from "../ai/providers/index.js";
import { AiBudgetError, getAiRequestBudget } from "../ai/requestBudget.js";
import {
  getBraveSearchAvailability,
  searchBraveWeb,
  WebSearchProviderError,
} from "../ai/providers/braveSearchProvider.js";
import { appendSourceList, buildWebContext, buildWebSearchQuery } from "../ai/webRetrieval.js";
import { getStore } from "../storage/index.js";

const router = express.Router();
const VALID_SCOPES = new Set(["node", "branch", "map"]);
const MAX_USER_MESSAGE_LENGTH = 2_000;
const HISTORY_LIMIT = 12;

// MongoDB ObjectIds (hosted) or UUIDs (local file storage).
const isValidConversationId = (value) => /^[0-9a-f]{24}$/i.test(value)
  || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeOptionalId = (value) => {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, 128) || null;
};

export const normalizeTeacherRequest = (body = {}) => {
  const documentId = normalizeOptionalId(body.documentId);
  const conversationId = normalizeOptionalId(body.conversationId);
  const nodeId = normalizeOptionalId(body.nodeId);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode : "verify";
  const scope = typeof body.scope === "string" ? body.scope : "node";
  const webSearch = body.webSearch === true || WEB_RAG_MODES.has(mode);

  if (!documentId) throw new Error("Thiếu mind map cần học.");
  if (!message) throw new Error("Hãy nhập lời giải thích cần nhận xét.");
  if (message.length > MAX_USER_MESSAGE_LENGTH) {
    throw new Error("Câu hỏi không được vượt quá 2.000 ký tự.");
  }
  if (!VALID_TEACHER_MODES.has(mode)) throw new Error("Chế độ AI Teacher không hợp lệ.");
  if (!VALID_SCOPES.has(scope)) throw new Error("Phạm vi AI Teacher không hợp lệ.");
  if (scope !== "map" && !nodeId) throw new Error("Hãy chọn một node để AI Teacher phân tích.");
  if (conversationId && !isValidConversationId(conversationId)) {
    throw new Error("Mã cuộc hội thoại không hợp lệ.");
  }

  return { documentId, conversationId, nodeId, message, mode, scope, webSearch };
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
  res.json({
    ...(activeProvider() === "openai" ? getAiRequestBudget() : getCloudflareAiAvailability()),
    configured: isAiConfigured(),
    model: describeAi().model,
    webSearch: getBraveSearchAvailability(),
  });
});

router.get("/conversations", async (req, res, next) => {
  try {
    const documentId = normalizeOptionalId(req.query.documentId);
    if (!documentId) return res.status(400).json({ message: "Thiếu mind map cần tải hội thoại." });

    const conversations = await getStore().ai.listConversations(req.user.id, documentId, 50);
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations/:conversationId/messages", async (req, res, next) => {
  try {
    const conversationId = String(req.params.conversationId);
    if (!isValidConversationId(conversationId)) {
      return res.status(400).json({ message: "Mã cuộc hội thoại không hợp lệ." });
    }

    const store = getStore();
    const conversation = await store.ai.getConversation(req.user.id, conversationId);
    if (!conversation) return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });

    const messages = await store.ai.listMessages(req.user.id, conversation._id, { limit: 200 });

    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

router.delete("/conversations/:conversationId", async (req, res, next) => {
  try {
    const conversationId = String(req.params.conversationId);
    if (!isValidConversationId(conversationId)) {
      return res.status(400).json({ message: "Mã cuộc hội thoại không hợp lệ." });
    }

    const conversation = await getStore().ai.deleteConversation(req.user.id, conversationId);
    if (!conversation) return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

const requireAiAvailability = (_req, res, next) => {
  try {
    if (activeProvider() === "cloudflare") assertCloudflareAiAvailable();
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
      const store = getStore();
      const mindMap = await store.mindMaps.get(req.user.id, input.documentId);
      if (!mindMap) return res.status(404).json({ message: "Không tìm thấy mind map." });

      // Validate and build context before creating any database records so an
      // invalid/missing node cannot leave behind an empty conversation.
      const teacherContext = buildTeacherContext(mindMap.document, {
        scope: input.scope,
        nodeId: input.nodeId,
        maxChars: input.mode === "verify" ? 4_000 : 12_000,
        selectedOnly: ["verify", "explain", "debate"].includes(input.mode.replace(/_rag$/, "")),
      });
      let webSources = [];
      if (input.webSearch) {
        const query = buildWebSearchQuery({
          document: mindMap.document,
          nodeId: input.nodeId,
          message: input.message,
          mode: input.mode,
        });
        const webResult = await searchBraveWeb({ query });
        webSources = webResult.sources;
        if (!webSources.length) {
          throw new WebSearchProviderError("Không tìm thấy nguồn web phù hợp để Teacher dùng làm bằng chứng.", {
            status: 404,
            code: "WEB_SEARCH_NO_RESULTS",
          });
        }
      }

      let conversation = null;
      const isNewConversation = !input.conversationId;
      if (input.conversationId) {
        conversation = await store.ai.getConversation(req.user.id, input.conversationId, input.documentId);
        if (!conversation) {
          return res.status(404).json({ message: "Không tìm thấy cuộc hội thoại." });
        }
      }

      const recentMessages = conversation
        ? await store.ai.listMessages(req.user.id, conversation._id, { limit: HISTORY_LIMIT, newestFirst: true })
        : [];

      const providerMessages = [
        {
          role: "system",
          content: buildTeacherSystemPrompt({
            mode: input.mode,
            scope: input.scope,
            context: teacherContext.text,
            webContext: buildWebContext(webSources),
          }),
        },
        ...recentMessages.reverse().map(({ role, content }) => ({ role, content })),
        { role: "user", content: input.message },
      ];

      const answer = await runTeacherModel({ messages: providerMessages });
      if (!answer.content) {
        throw new AiProviderError("AI Teacher không tạo được câu trả lời.", {
          status: 502,
          code: "AI_EMPTY_RESPONSE",
        });
      }
      const answerContent = appendSourceList(answer.content, webSources);

      if (!conversation) {
        conversation = await store.ai.createConversation({
          ownerId: req.user.id,
          documentId: input.documentId,
          title: input.message.slice(0, 80),
          mode: input.mode,
          scope: input.scope,
          nodeId: input.nodeId,
        });
      }

      const [, assistantMessage] = await store.ai.addMessages(req.user.id, conversation._id, [
        {
          role: "user",
          content: input.message,
          referencedNodeIds: teacherContext.referencedNodeIds,
        },
        {
          role: "assistant",
          content: answerContent,
          referencedNodeIds: teacherContext.referencedNodeIds,
          usage: answer.usage,
        },
      ]);

      conversation = await store.ai.updateConversation(req.user.id, conversation._id, {
        mode: input.mode,
        scope: input.scope,
        nodeId: input.nodeId,
        lastMessageAt: new Date().toISOString(),
      }) || conversation;

      res.status(isNewConversation ? 201 : 200).json({
        conversation,
        message: assistantMessage,
        model: answer.model,
      });
    } catch (error) {
      if (error instanceof AiBudgetError) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(error.retryAt).getTime() - Date.now()) / 1_000))));
        return res.status(error.status).json({ message: error.message, code: error.code, retryAt: error.retryAt });
      }
      if (error instanceof WebSearchProviderError) {
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof AiRequestError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
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
