import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const createMapId = (): string =>
  randomBytes(5).toString("base64url").slice(0, 8);

export const createEditToken = (): string => randomBytes(24).toString("base64url");

export const hashEditToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const tokensMatch = (token: string, hash: string): boolean => {
  const tokenHash = hashEditToken(token);
  try {
    return timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
  } catch {
    return false;
  }
};
