/** Lightweight Web Audio synth cues (hit / death / reload). */

let sharedCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }
  if (!sharedCtx) {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
};

const resumeIfNeeded = async (ctx: AudioContext) => {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Autoplay policies may block until a gesture; ignore.
    }
  }
};

const playTone = (options: {
  frequency: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  frequencyEnd?: number;
  muted: boolean;
}) => {
  if (options.muted) {
    return;
  }
  const ctx = getCtx();
  if (!ctx) {
    return;
  }
  void resumeIfNeeded(ctx);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = options.type ?? "square";
  osc.frequency.setValueAtTime(options.frequency, now);
  if (options.frequencyEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.frequencyEnd),
      now + options.duration
    );
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + options.duration + 0.02);
};

export const playHitSynth = (muted: boolean, severity = 0.5) => {
  const t = Math.max(0.15, Math.min(1, severity));
  playTone({
    frequency: 420 + t * 180,
    frequencyEnd: 180,
    duration: 0.08 + t * 0.06,
    volume: 0.08 + t * 0.06,
    type: "triangle",
    muted,
  });
};

export const playDeathSynth = (muted: boolean) => {
  playTone({
    frequency: 220,
    frequencyEnd: 55,
    duration: 0.35,
    volume: 0.12,
    type: "sawtooth",
    muted,
  });
};

export const playReloadSynth = (muted: boolean) => {
  playTone({
    frequency: 640,
    frequencyEnd: 480,
    duration: 0.06,
    volume: 0.05,
    type: "square",
    muted,
  });
};

export const playPickupSynth = (
  muted: boolean,
  kind: "health" | "ammo" = "health"
) => {
  if (kind === "ammo") {
    playTone({
      frequency: 520,
      frequencyEnd: 780,
      duration: 0.09,
      volume: 0.07,
      type: "triangle",
      muted,
    });
    return;
  }
  playTone({
    frequency: 380,
    frequencyEnd: 620,
    duration: 0.1,
    volume: 0.07,
    type: "sine",
    muted,
  });
};
