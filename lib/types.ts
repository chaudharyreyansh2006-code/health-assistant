import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { getWeather } from "./ai/tools/get-weather";
import type { queryHealthData } from "./ai/tools/query-health-data";
import type { requestHealthSuggestions } from "./ai/tools/request-health-suggestions";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { saveHealthMemory } from "./ai/tools/save-health-memory";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type saveHealthMemoryTool = InferUITool<ReturnType<typeof saveHealthMemory>>;
type requestHealthSuggestionsTool = InferUITool<
  ReturnType<typeof requestHealthSuggestions>
>;
type queryHealthDataTool = InferUITool<ReturnType<typeof queryHealthData>>;

// ChatTools must enumerate every tool the LLM can call so that:
//   1. `InferUITool` infers the correct input/output shape for each tool part.
//   2. `convertToModelMessages` preserves `callProviderMetadata` (e.g. Gemini's
//      `thoughtSignature`) on the model-side tool-call part.
//      If a tool is not listed here, the tool part is treated as an unknown shape
//      and the AI SDK silently drops `callProviderMetadata`, which is exactly what
//      triggers the "Replayed N functionCall part(s) for a Gemini 3 model without
//      a thoughtSignature" warning we have been seeing.
export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  saveHealthMemory: saveHealthMemoryTool;
  requestHealthSuggestions: requestHealthSuggestionsTool;
  queryHealthData: queryHealthDataTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
