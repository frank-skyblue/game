import type { VercelResponse } from "@vercel/node";

export const json = (
  res: VercelResponse,
  status: number,
  body: unknown
): void => {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json(body);
};

export const readJsonBody = async <T>(req: {
  body?: unknown;
}): Promise<T | null> => {
  if (req.body == null) {
    return null;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return null;
    }
  }
  if (typeof req.body === "object") {
    return req.body as T;
  }
  return null;
};
