import type { ArenaDefinition } from "@pvp-arena/shared";

export type MapListItem = {
  id: string;
  name: string;
  author: string | null;
  createdAt: string;
};

export type MapDetail = MapListItem & {
  updatedAt: string;
  arena: ArenaDefinition;
};

const EDIT_TOKEN_PREFIX = "pvp-arena-map-token:";

export const getStoredEditToken = (mapId: string): string | null => {
  try {
    return window.localStorage.getItem(`${EDIT_TOKEN_PREFIX}${mapId}`);
  } catch {
    return null;
  }
};

export const storeEditToken = (mapId: string, editToken: string) => {
  try {
    window.localStorage.setItem(`${EDIT_TOKEN_PREFIX}${mapId}`, editToken);
  } catch {
    // Ignore quota / private-mode failures.
  }
};

export const clearStoredEditToken = (mapId: string) => {
  try {
    window.localStorage.removeItem(`${EDIT_TOKEN_PREFIX}${mapId}`);
  } catch {
    // Ignore.
  }
};

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      return body.error;
    }
  } catch {
    // Fall through.
  }
  return `Request failed (${response.status}).`;
};

export const listMaps = async (): Promise<MapListItem[]> => {
  const response = await fetch("/api/maps");
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const body = (await response.json()) as { maps: MapListItem[] };
  return body.maps ?? [];
};

export const getMap = async (id: string): Promise<MapDetail> => {
  const response = await fetch(`/api/maps/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as MapDetail;
};

export const createMap = async (input: {
  name: string;
  author?: string;
  arena: ArenaDefinition;
}): Promise<{ id: string; editToken: string; name: string }> => {
  const response = await fetch("/api/maps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const body = (await response.json()) as {
    id: string;
    editToken: string;
    name: string;
  };
  storeEditToken(body.id, body.editToken);
  return body;
};

export const updateMap = async (input: {
  id: string;
  name: string;
  author?: string;
  arena: ArenaDefinition;
  editToken: string;
}): Promise<MapDetail> => {
  const response = await fetch(`/api/maps/${encodeURIComponent(input.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      author: input.author,
      arena: input.arena,
      editToken: input.editToken,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as MapDetail;
};

export const deleteMap = async (id: string, editToken: string): Promise<void> => {
  const response = await fetch(`/api/maps/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editToken }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  clearStoredEditToken(id);
};
