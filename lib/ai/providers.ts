import { google } from "@ai-sdk/google";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Direct Google Gemini provider — uses GOOGLE_GENERATIVE_AI_API_KEY env var
  return google(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return google("gemini-3.1-flash-lite");
}
