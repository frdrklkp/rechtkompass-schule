// Server-only Resend adapter. Nutzt fetch, kein SDK.
// Env: RESEND_API_KEY (required), RESEND_FROM_EMAIL (optional)

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  /** Anhänge, content base64-kodiert (Resend-API-Format). */
  attachments?: Array<{ filename: string; content: string }>;
};

export type SendEmailResult = {
  id?: string;
  provider: "resend";
};

const DEFAULT_FROM = "RechtKompass Schule <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend ist nicht konfiguriert.");
  }
  const from = input.from ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      attachments: input.attachments,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${bodyText.slice(0, 500)}`);
  }
  try {
    const j = JSON.parse(bodyText) as { id?: string };
    return { id: j.id, provider: "resend" };
  } catch {
    return { provider: "resend" };
  }
}
