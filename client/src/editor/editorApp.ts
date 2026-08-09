import {
  cloneArena,
  DEFAULT_ARENA,
  MAX_SPAWNS,
  MAX_WALLS,
  PLAYER_RADIUS,
  validateArena,
  type ArenaDefinition,
  type Wall,
} from "@pvp-arena/shared";
import {
  createMap,
  deleteMap,
  getMap,
  getStoredEditToken,
  listMaps,
  updateMap,
  type MapListItem,
} from "../mapsApi";

type Tool = "wall" | "spawn" | "select";

const SNAP = 20;

const snap = (value: number): number => Math.round(value / SNAP) * SNAP;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const mountEditor = (root: HTMLElement) => {
  let arena = cloneArena(DEFAULT_ARENA);
  let tool: Tool = "wall";
  let selectedWall = -1;
  let selectedSpawn = -1;
  let mapId: string | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let draftWall: Wall | null = null;
  let maps: MapListItem[] = [];

  root.innerHTML = `
    <div class="editor-shell">
      <header class="editor-header">
        <div>
          <a class="editor-back" href="/" aria-label="Back to lobby">← Lobby</a>
          <h1>Level Editor</h1>
          <p class="editor-tagline">Paint walls and spawn points, then save to the maps API.</p>
        </div>
        <p id="editorStatus" class="editor-status" role="status" aria-live="polite"></p>
      </header>

      <div class="editor-layout">
        <aside class="editor-sidebar" aria-label="Editor controls">
          <div class="field">
            <label for="mapName">Map name</label>
            <input id="mapName" maxlength="48" value="My Arena" aria-label="Map name" />
          </div>
          <div class="field">
            <label for="mapAuthor">Author (optional)</label>
            <input id="mapAuthor" maxlength="32" aria-label="Author name" />
          </div>
          <div class="field">
            <span id="toolLabel">Tool</span>
            <div class="tool-row" role="group" aria-labelledby="toolLabel">
              <button type="button" class="tool-btn" data-tool="wall" aria-pressed="true">Wall</button>
              <button type="button" class="tool-btn" data-tool="spawn" aria-pressed="false">Spawn</button>
              <button type="button" class="tool-btn" data-tool="select" aria-pressed="false">Select</button>
            </div>
          </div>
          <p class="editor-hint">
            Wall: drag on the canvas. Spawn: click. Select: click then Delete.
            Snap is ${SNAP}px. Max ${MAX_WALLS} walls / ${MAX_SPAWNS} spawns.
          </p>
          <div class="editor-actions">
            <button type="button" id="saveMapBtn" aria-label="Save map">Save new</button>
            <button type="button" id="updateMapBtn" class="secondary" aria-label="Update map">Update</button>
            <button type="button" id="deleteMapBtn" class="secondary" aria-label="Delete map">Delete</button>
            <button type="button" id="exportMapBtn" class="secondary" aria-label="Export JSON">Export JSON</button>
            <button type="button" id="importMapBtn" class="secondary" aria-label="Import JSON">Import JSON</button>
            <button type="button" id="resetMapBtn" class="secondary" aria-label="Reset to classic">Reset classic</button>
          </div>
          <input id="importFile" type="file" accept="application/json,.json" hidden />
          <div class="field">
            <label for="loadMapSelect">Load saved map</label>
            <div class="load-row">
              <select id="loadMapSelect" aria-label="Saved maps"></select>
              <button type="button" id="loadMapBtn" class="secondary" aria-label="Load selected map">Load</button>
            </div>
          </div>
          <p id="mapMeta" class="editor-meta"></p>
        </aside>
        <div class="editor-canvas-wrap">
          <canvas id="editorCanvas" width="${arena.width}" height="${arena.height}" tabindex="0" aria-label="Arena canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = root.querySelector("#editorCanvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available.");
  }

  const statusEl = root.querySelector("#editorStatus") as HTMLParagraphElement;
  const nameInput = root.querySelector("#mapName") as HTMLInputElement;
  const authorInput = root.querySelector("#mapAuthor") as HTMLInputElement;
  const mapMeta = root.querySelector("#mapMeta") as HTMLParagraphElement;
  const loadSelect = root.querySelector("#loadMapSelect") as HTMLSelectElement;
  const importFile = root.querySelector("#importFile") as HTMLInputElement;
  const toolButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-tool]")
  );

  const setStatus = (message: string) => {
    statusEl.textContent = message;
  };

  const updateMeta = () => {
    mapMeta.textContent = mapId
      ? `Editing map id: ${mapId}`
      : "Unsaved local draft";
  };

  const setTool = (next: Tool) => {
    tool = next;
    for (const button of toolButtons) {
      button.setAttribute(
        "aria-pressed",
        button.dataset.tool === tool ? "true" : "false"
      );
    }
  };

  const canvasPoint = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = arena.width / rect.width;
    const scaleY = arena.height / rect.height;
    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, arena.width),
      y: clamp((event.clientY - rect.top) * scaleY, 0, arena.height),
    };
  };

  const hitWall = (x: number, y: number): number => {
    for (let i = arena.walls.length - 1; i >= 0; i -= 1) {
      const wall = arena.walls[i]!;
      if (
        x >= wall.x &&
        y >= wall.y &&
        x <= wall.x + wall.width &&
        y <= wall.y + wall.height
      ) {
        return i;
      }
    }
    return -1;
  };

  const hitSpawn = (x: number, y: number): number => {
    for (let i = arena.spawnPoints.length - 1; i >= 0; i -= 1) {
      const spawn = arena.spawnPoints[i]!;
      const dx = x - spawn.x;
      const dy = y - spawn.y;
      if (dx * dx + dy * dy <= (PLAYER_RADIUS + 6) ** 2) {
        return i;
      }
    }
    return -1;
  };

  const draw = () => {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, arena.width, arena.height);

    ctx.strokeStyle = "rgba(31, 41, 55, 0.7)";
    ctx.lineWidth = 1;
    for (let x = 0; x < arena.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, arena.height);
      ctx.stroke();
    }
    for (let y = 0; y < arena.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(arena.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, arena.width - 2, arena.height - 2);

    const wallsToDraw = draftWall ? [...arena.walls, draftWall] : arena.walls;
    wallsToDraw.forEach((wall, index) => {
      const selected = index === selectedWall && !draftWall;
      ctx.fillStyle = selected ? "#64748b" : "#475569";
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = selected ? "#e2e8f0" : "#94a3b8";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });

    arena.spawnPoints.forEach((spawn, index) => {
      const selected = index === selectedSpawn;
      ctx.beginPath();
      ctx.arc(spawn.x, spawn.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#38bdf8" : "#0ea5e9";
      ctx.fill();
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), spawn.x, spawn.y + 4);
    });
  };

  const applyArena = (next: ArenaDefinition, options?: { mapId?: string | null }) => {
    arena = cloneArena(next);
    canvas.width = arena.width;
    canvas.height = arena.height;
    selectedWall = -1;
    selectedSpawn = -1;
    draftWall = null;
    dragStart = null;
    if (options && "mapId" in options) {
      mapId = options.mapId ?? null;
    }
    updateMeta();
    draw();
  };

  const refreshMapList = async () => {
    try {
      maps = await listMaps();
      loadSelect.innerHTML = maps
        .map(
          (map) =>
            `<option value="${map.id}">${map.name}${map.author ? ` — ${map.author}` : ""}</option>`
        )
        .join("");
      if (maps.length === 0) {
        loadSelect.innerHTML = `<option value="">No saved maps</option>`;
      }
    } catch (error) {
      console.error(error);
      loadSelect.innerHTML = `<option value="">API unavailable</option>`;
      setStatus(
        error instanceof Error ? error.message : "Could not list maps."
      );
    }
  };

  const currentArenaPayload = (): ArenaDefinition => ({
    width: arena.width,
    height: arena.height,
    walls: arena.walls.map((wall) => ({ ...wall })),
    spawnPoints: arena.spawnPoints.map((spawn) => ({ ...spawn })),
  });

  const handleSaveNew = async () => {
    const validated = validateArena(currentArenaPayload());
    if (!validated.ok) {
      setStatus(validated.error);
      return;
    }
    try {
      setStatus("Saving...");
      const created = await createMap({
        name: nameInput.value,
        author: authorInput.value,
        arena: validated.arena,
      });
      mapId = created.id;
      updateMeta();
      setStatus(`Saved as ${created.id}. Edit token stored in this browser.`);
      await refreshMapList();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Save failed.");
    }
  };

  const handleUpdate = async () => {
    if (!mapId) {
      setStatus("Save a new map first, or load one you own.");
      return;
    }
    const editToken = getStoredEditToken(mapId);
    if (!editToken) {
      setStatus("No edit token in this browser for that map.");
      return;
    }
    const validated = validateArena(currentArenaPayload());
    if (!validated.ok) {
      setStatus(validated.error);
      return;
    }
    try {
      setStatus("Updating...");
      await updateMap({
        id: mapId,
        name: nameInput.value,
        author: authorInput.value,
        arena: validated.arena,
        editToken,
      });
      setStatus(`Updated ${mapId}.`);
      await refreshMapList();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Update failed.");
    }
  };

  const handleDelete = async () => {
    if (!mapId) {
      setStatus("Load a saved map before deleting.");
      return;
    }
    const editToken = getStoredEditToken(mapId);
    if (!editToken) {
      setStatus("No edit token in this browser for that map.");
      return;
    }
    if (!window.confirm(`Delete map ${mapId}?`)) {
      return;
    }
    try {
      setStatus("Deleting...");
      await deleteMap(mapId, editToken);
      mapId = null;
      updateMeta();
      setStatus("Map deleted.");
      await refreshMapList();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  const handleExport = () => {
    const validated = validateArena(currentArenaPayload());
    if (!validated.ok) {
      setStatus(validated.error);
      return;
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            name: nameInput.value,
            author: authorInput.value || undefined,
            arena: validated.arena,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${nameInput.value.trim() || "arena"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Exported JSON.");
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        name?: string;
        author?: string;
        arena?: ArenaDefinition;
      } & Partial<ArenaDefinition>;
      const arenaRaw = parsed.arena ?? parsed;
      const validated = validateArena(arenaRaw);
      if (!validated.ok) {
        setStatus(validated.error);
        return;
      }
      if (typeof parsed.name === "string") {
        nameInput.value = parsed.name;
      }
      if (typeof parsed.author === "string") {
        authorInput.value = parsed.author;
      }
      applyArena(validated.arena, { mapId: null });
      setStatus("Imported JSON draft.");
    } catch (error) {
      console.error(error);
      setStatus("Could not import that JSON file.");
    }
  };

  const handleLoad = async () => {
    const id = loadSelect.value;
    if (!id) {
      setStatus("No map selected.");
      return;
    }
    try {
      setStatus(`Loading ${id}...`);
      const detail = await getMap(id);
      nameInput.value = detail.name;
      authorInput.value = detail.author ?? "";
      applyArena(detail.arena, { mapId: detail.id });
      setStatus(`Loaded ${detail.name}.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Load failed.");
    }
  };

  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset.tool as Tool;
      setTool(next);
    });
  }

  canvas.addEventListener("mousedown", (event) => {
    const point = canvasPoint(event);
    if (tool === "wall") {
      dragStart = { x: snap(point.x), y: snap(point.y) };
      draftWall = {
        x: dragStart.x,
        y: dragStart.y,
        width: SNAP,
        height: SNAP,
      };
      draw();
      return;
    }

    if (tool === "spawn") {
      if (arena.spawnPoints.length >= MAX_SPAWNS) {
        setStatus(`Max ${MAX_SPAWNS} spawn points.`);
        return;
      }
      const x = snap(point.x);
      const y = snap(point.y);
      arena.spawnPoints.push({
        x: clamp(x, PLAYER_RADIUS, arena.width - PLAYER_RADIUS),
        y: clamp(y, PLAYER_RADIUS, arena.height - PLAYER_RADIUS),
      });
      selectedSpawn = arena.spawnPoints.length - 1;
      selectedWall = -1;
      draw();
      return;
    }

    const spawnIndex = hitSpawn(point.x, point.y);
    if (spawnIndex >= 0) {
      selectedSpawn = spawnIndex;
      selectedWall = -1;
      draw();
      return;
    }
    const wallIndex = hitWall(point.x, point.y);
    selectedWall = wallIndex;
    selectedSpawn = -1;
    draw();
  });

  canvas.addEventListener("mousemove", (event) => {
    if (!dragStart || tool !== "wall") {
      return;
    }
    const point = canvasPoint(event);
    const x2 = snap(point.x);
    const y2 = snap(point.y);
    const x = Math.min(dragStart.x, x2);
    const y = Math.min(dragStart.y, y2);
    const width = Math.max(SNAP, Math.abs(x2 - dragStart.x));
    const height = Math.max(SNAP, Math.abs(y2 - dragStart.y));
    draftWall = {
      x: clamp(x, 0, arena.width - SNAP),
      y: clamp(y, 0, arena.height - SNAP),
      width: Math.min(width, arena.width - x),
      height: Math.min(height, arena.height - y),
    };
    draw();
  });

  const finishWallDrag = () => {
    if (!draftWall) {
      dragStart = null;
      return;
    }
    if (arena.walls.length >= MAX_WALLS) {
      setStatus(`Max ${MAX_WALLS} walls.`);
    } else if (draftWall.width >= 8 && draftWall.height >= 8) {
      arena.walls.push(draftWall);
      selectedWall = arena.walls.length - 1;
      selectedSpawn = -1;
    }
    draftWall = null;
    dragStart = null;
    draw();
  };

  canvas.addEventListener("mouseup", finishWallDrag);
  canvas.addEventListener("mouseleave", finishWallDrag);

  window.addEventListener("keydown", (event) => {
    if (!root.isConnected) {
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    if (selectedWall >= 0) {
      arena.walls.splice(selectedWall, 1);
      selectedWall = -1;
      draw();
      event.preventDefault();
      return;
    }
    if (selectedSpawn >= 0) {
      arena.spawnPoints.splice(selectedSpawn, 1);
      selectedSpawn = -1;
      draw();
      event.preventDefault();
    }
  });

  root.querySelector("#saveMapBtn")?.addEventListener("click", () => {
    void handleSaveNew();
  });
  root.querySelector("#updateMapBtn")?.addEventListener("click", () => {
    void handleUpdate();
  });
  root.querySelector("#deleteMapBtn")?.addEventListener("click", () => {
    void handleDelete();
  });
  root.querySelector("#exportMapBtn")?.addEventListener("click", handleExport);
  root.querySelector("#importMapBtn")?.addEventListener("click", () => {
    importFile.click();
  });
  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    if (file) {
      void handleImportFile(file);
    }
    importFile.value = "";
  });
  root.querySelector("#resetMapBtn")?.addEventListener("click", () => {
    applyArena(DEFAULT_ARENA, { mapId: null });
    nameInput.value = "Classic";
    setStatus("Reset to classic arena draft.");
  });
  root.querySelector("#loadMapBtn")?.addEventListener("click", () => {
    void handleLoad();
  });

  applyArena(DEFAULT_ARENA, { mapId: null });
  updateMeta();
  void refreshMapList();
};
