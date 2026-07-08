export const DEFAULT_CHAT_MODEL = "gemini-3-flash-preview";

export const titleModel = {
  id: "gemini-3.1-flash-lite",
  name: "Gemini 3.1 Flash Lite",
  provider: "google",
  description: "Fast model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const chatModels: ChatModel[] = [
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash",
    provider: "google",
    description: "Fast and capable model for health conversations",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "Advanced model for complex health analysis",
  },
];

// Since we use Google Gemini directly, capabilities are known ahead of time
export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return Object.fromEntries(
    chatModels.map((model) => [
      model.id,
      {
        tools: true,
        vision: true,
        reasoning: true,
      },
    ])
  );
}

export const isDemo = process.env.IS_DEMO === "1";

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  const capabilities = await getCapabilities();
  return chatModels.map((model) => ({
    ...model,
    capabilities: capabilities[model.id] ?? {
      tools: true,
      vision: true,
      reasoning: false,
    },
  }));
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
