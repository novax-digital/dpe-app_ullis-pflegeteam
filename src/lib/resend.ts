import "server-only";

import { Resend, type CreateEmailOptions } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendDefaultFrom = process.env.RESEND_FROM_EMAIL?.trim();

let resendClient: Resend | null = null;

export const hasResendEnv = Boolean(resendApiKey);
export const hasResendDefaultFrom = Boolean(resendDefaultFrom);

export function getResendDefaultFrom() {
  if (!resendDefaultFrom) {
    throw new Error("RESEND_FROM_EMAIL fehlt.");
  }

  return resendDefaultFrom;
}

export function createResendClient() {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY fehlt.");
  }

  return new Resend(resendApiKey);
}

export function getResendClient() {
  resendClient ??= createResendClient();
  return resendClient;
}

export async function sendEmail(options: CreateEmailOptions) {
  return getResendClient().emails.send(options);
}
