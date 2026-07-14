import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type AuthEmailKind = "invite" | "recovery";

const AUTH_ACTION_VALIDITY_MS = 72 * 60 * 60 * 1000;

type AuthActionPayload = {
  email: string;
  expiresAt: number;
  nonce: string;
  type: AuthEmailKind;
};

function authActionSecret() {
  const secret =
    process.env.AUTH_ACTION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("AUTH_ACTION_SECRET ist nicht konfiguriert.");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", authActionSecret())
    .update(payload)
    .digest("base64url");
}

export function createAuthActionToken(email: string, type: AuthEmailKind) {
  const payload: AuthActionPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + AUTH_ACTION_VALIDITY_MS,
    nonce: randomBytes(16).toString("base64url"),
    type,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAuthActionToken(
  token: string,
  expectedType: AuthEmailKind,
) {
  const [encoded, providedSignature, ...rest] = token.split(".");
  if (!encoded || !providedSignature || rest.length) return null;

  const expectedSignature = sign(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as AuthActionPayload;
    if (
      payload.type !== expectedType ||
      !payload.email ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
