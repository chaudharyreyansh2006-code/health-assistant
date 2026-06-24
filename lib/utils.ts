import type {
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatbotError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatbotError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatbotError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatbotError('offline:chat');
    }

    throw error;
  }
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

/**
 * Normalizes a message part read back from the database so that AI SDK
 * provider-specific metadata (`callProviderMetadata` on tool parts,
 * `providerMetadata` on text/file parts) is always carried forward.
 *
 * Why this matters: when assistant tool-call parts are persisted to Postgres
 * and then re-read, any of these scenarios can silently drop
 * `providerOptions.google.thoughtSignature`, which is REQUIRED by Gemini 3
 * multi-turn tool calls. Without it, the second turn fails with HTTP 400.
 *
 * This function:
 *  - For tool parts, hoists `providerMetadata`/`providerOptions` into
 *    `callProviderMetadata` (the field name used on UI tool parts).
 *  - For text/reasoning/file parts, mirrors `callProviderMetadata` into
 *    `providerMetadata` (the field name used on UI text parts).
 *  - Leaves everything else untouched.
 */
function normalizePersistedPart(
  part: unknown,
): UIMessagePart<CustomUIDataTypes, ChatTools> {
  if (!part || typeof part !== 'object') {
    return part as UIMessagePart<CustomUIDataTypes, ChatTools>;
  }

  const obj = part as Record<string, unknown>;

  // Tool parts
  if (typeof obj.type === 'string' && obj.type.startsWith('tool-')) {
    if (obj.callProviderMetadata == null) {
      const hoisted =
        (obj.providerMetadata as Record<string, unknown> | undefined) ??
        (obj.providerOptions as Record<string, unknown> | undefined);
      if (hoisted) {
        return {
          ...obj,
          callProviderMetadata: hoisted,
        } as UIMessagePart<CustomUIDataTypes, ChatTools>;
      }
    }
    return obj as unknown as UIMessagePart<CustomUIDataTypes, ChatTools>;
  }

  // Text / reasoning / file / data parts: mirror `callProviderMetadata` to `providerMetadata`
  if (obj.providerMetadata == null && obj.callProviderMetadata != null) {
    return {
      ...obj,
      providerMetadata: obj.callProviderMetadata,
    } as UIMessagePart<CustomUIDataTypes, ChatTools>;
  }

  return obj as UIMessagePart<CustomUIDataTypes, ChatTools>;
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: (
      Array.isArray(message.parts) ? message.parts : []
    ).map(normalizePersistedPart) as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}
