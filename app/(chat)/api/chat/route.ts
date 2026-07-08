import { google } from "@ai-sdk/google";
import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  fetchDocumentContext,
  fetchHealthContext,
} from "@/lib/ai/health-context";
import {
  allowedModelIds,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { queryHealthData } from "@/lib/ai/tools/query-health-data";
import { requestHealthSuggestions } from "@/lib/ai/tools/request-health-suggestions";
import { saveHealthMemory } from "@/lib/ai/tools/save-health-memory";
import { toGoogleFileModelMessages } from "@/lib/ai/upload-blob-to-google";
import { isRegularSession } from "@/lib/auth/guards";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getFamilyMemberById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import type { FamilyMember } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
      memberId,
      webSearchEnabled,
      urlContextEnabled,
    } = requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    if (!isRegularSession(session)) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    await checkIpRateLimit(ipAddress(request));

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 1,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    // Determine the memberId: from request body, or from existing chat record.
    // We validate that it's a real UUID before using it, otherwise we treat
    // the chat as having no member and skip health-tool registration. This
    // prevents the legacy "saveHealthMemory with memberId=''" code path that
    // used to fail with a silent FK violation and let the LLM lie about it.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawMemberId = memberId ?? chat?.memberId ?? undefined;
    const activeMemberId =
      rawMemberId && UUID_RE.test(rawMemberId) ? rawMemberId : undefined;

    // CRITICAL: verify the caller owns this member BEFORE we do anything that
    // could leak PHI — saving the chat with a foreign memberId, enabling
    // health tools, or stuffing the member's profile into the system prompt.
    // Ownership is checked against the denormalized `FamilyMember.userId` —
    // single column compare, no joins. A foreign memberId is treated as no
    // member at all (defense in depth: also catches a stale chat with a
    // member the user no longer owns).
    let safeActiveMemberId: string | undefined = undefined;
    let ownedMemberRow: FamilyMember | null = null;
    if (activeMemberId) {
      const memberRow = await getFamilyMemberById({ id: activeMemberId });
      if (memberRow && memberRow.userId === session.user.id) {
        safeActiveMemberId = activeMemberId;
        ownedMemberRow = memberRow;
      } else {
        console.warn(
          "[chat] rejected foreign memberId",
          activeMemberId,
          "for user",
          session.user.id,
        );
      }
    }

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      // Also reconcile the persisted memberId with the safe one — a chat
      // can outlive its member (FK is `onDelete: "set null"`), so this is
      // a no-op in the common case but defends against the rare path
      // where a chat was somehow saved with a memberId the user no
      // longer owns.
      if (chat.memberId && chat.memberId !== safeActiveMemberId) {
        // Don't mutate the chat here — the request is still in flight.
        // The next save will use `safeActiveMemberId`. The mismatch is
        // logged so we can spot a broken record in production logs.
        console.warn(
          "[chat] chat memberId drift",
          chat.id,
          "stored:",
          chat.memberId,
          "resolved:",
          safeActiveMemberId ?? "null",
        );
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
        memberId: safeActiveMemberId,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;

    // Find the last user message to query the vector DB
    const lastUserMessage = uiMessages.findLast((m) => m.role === "user");
    const lastUserMessageText =
      lastUserMessage?.parts
        ?.filter(
          (p) =>
            typeof p === "object" &&
            p !== null &&
            "type" in p &&
            p.type === "text" &&
            "text" in p
        )
        .map((p) => (p as { text: string }).text)
        .join("") || "";

    // Fetch health context, document chunks, and member profile for the
    // active family member. The health context + document RAG both filter
    // on `userId` server-side; the `activeMember` row was already verified
    // against `memberRow.userId === session.user.id` above (see
    // `safeActiveMemberId`), so we reuse the verified row here instead
    // of a second DB call.
    const [healthContext, documentContext] = await Promise.all([
      safeActiveMemberId
        ? fetchHealthContext({
            memberId: safeActiveMemberId,
            userId: session.user.id,
          })
        : undefined,
      safeActiveMemberId && lastUserMessageText
        ? fetchDocumentContext({
            memberId: safeActiveMemberId,
            userId: session.user.id,
            query: lastUserMessageText,
          })
        : undefined,
    ]);
    const activeMember = ownedMemberRow;

    // Upload chat image attachments to Google Files so the model can
    // reference them as `fileData.fileUri` instead of trying to download
    // our authed route. The Google provider already turns a `URL` part
    // into `fileData.fileUri`; `supportedUrls` matches any https:// URL so
    // the SDK does not re-download. Falls back to inline base64 if the
    // upload fails so the chat never breaks on a transient upload error.
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const modelMessages = await toGoogleFileModelMessages(
      await convertToModelMessages(uiMessages),
      googleApiKey
    );

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const baseActiveTools: (
          | "saveHealthMemory"
          | "requestHealthSuggestions"
          | "queryHealthData"
          | "googleSearch"
          | "urlContext"
        )[] = [];

        // Only enable health tools when there is an active family member the
        // caller actually owns. Without a memberId, the tool would no-op or
        // fail; we don't want the LLM to call it and then "lie" about the
        // result. `safeActiveMemberId` is `undefined` when the caller passed
        // a memberId they don't own — same downstream behavior as no member
        // at all, no PHI exposure.
        if (safeActiveMemberId) {
          baseActiveTools.push(
            "saveHealthMemory",
            "requestHealthSuggestions",
            "queryHealthData",
          );
        }
        if (webSearchEnabled) {
          baseActiveTools.push("googleSearch");
        }
        if (urlContextEnabled) {
          baseActiveTools.push("urlContext");
        }

        const result = streamText({
          model: getLanguageModel(chatModel),
          system: systemPrompt({
            requestHints,
            healthContext,
            documentContext,
            activeMember: activeMember ?? undefined,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          activeTools: baseActiveTools,
          tools: {
            ...(safeActiveMemberId
              ? {
                  saveHealthMemory: saveHealthMemory({
                    memberId: safeActiveMemberId,
                    userId: session.user.id,
                  }),
                  requestHealthSuggestions: requestHealthSuggestions({
                    memberId: safeActiveMemberId,
                    userId: session.user.id,
                  }),
                  queryHealthData: queryHealthData({
                    memberId: safeActiveMemberId,
                    userId: session.user.id,
                  }),
                }
              : {}),
            ...(webSearchEnabled
              ? { googleSearch: google.tools.googleSearch({}) as any }
              : {}),
            ...(urlContextEnabled
              ? { urlContext: google.tools.urlContext({}) as any }
              : {}),
          },
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingLevel: "high",
              },
            },
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          try {
            const title = await titlePromise;
            dataStream.write({ type: "data-chat-title", data: title });
            updateChatTitleById({ chatId: id, title });
          } catch (_) {
            /* non-fatal */
          }
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        if (
          error instanceof Error &&
          /does not support image input/i.test(error.message)
        ) {
          return "The selected model doesn't support image input. Please switch to a vision-capable model (e.g. Gemini Flash) in the model picker to send images.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!isRegularSession(session)) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
