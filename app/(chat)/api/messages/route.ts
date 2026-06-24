import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const session = await auth();

  if (!isRegularSession(session)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [chat, messages] = await Promise.all([
    getChatById({ id: chatId }),
    getMessagesByChatId({ id: chatId }),
  ]);

  if (!chat) {
    return Response.json({
      messages: [],
      visibility: "private",
      userId: null,
      isReadonly: false,
    });
  }

  if (
    chat.visibility === "private" &&
    session.user.id !== chat.userId
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = session.user.id !== chat.userId;

  return Response.json({
    messages: convertToUIMessages(messages),
    visibility: chat.visibility,
    userId: chat.userId,
    isReadonly,
    memberId: chat.memberId,
  });
}
