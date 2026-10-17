import { http, HttpResponse } from "msw";

export const requests: Array<{ method: string; payload: Record<string, unknown> }> = [];

export const telegramMocks = [
  http.all(/.*/, async ({ request }) => {
    if (new URL(request.url).hostname !== "api.telegram.org") {
      return HttpResponse.json({ ok: false }, { status: 404 });
    }
    const payload = await request.json<Record<string, unknown>>().catch(() => ({}));
    const method = new URL(request.url).pathname.split("/").at(-1) || "";
    requests.push({ method, payload });
    const result = method === "answerCallbackQuery" ? true : { message_id: requests.length };
    return HttpResponse.json({ ok: true, result });
  }),
];
