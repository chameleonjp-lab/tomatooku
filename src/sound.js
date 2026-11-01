/**
 * トマトオク 効果音
 *
 * 初回は音あり。保存済みの消音は維持し、操作後にWeb Audio APIで短い音を作る。
 * 音源ファイルを持たないため、追加通信や外部素材は発生しない。
 */

export const SOUND_STORAGE_KEY = "tomatoku.soundEnabled";

export const SOUND_VOLUME_STORAGE_KEY = "tomatoku.soundVolume";
const activeVoices = new Set();
const MAX_VOICES = 8;
let soundVolume = loadVolumeSetting();
let soundEnabled = loadSoundSetting();
let audioContext = null;
const lastPlayedAt = new Map();

function loadVolumeSetting() {
  try {
    const raw = globalThis.localStorage?.getItem(SOUND_VOLUME_STORAGE_KEY);
    if (raw === null || raw === undefined || raw.trim() === "") return 1;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
  } catch (_) { return 1; }
}

export function getSoundVolume() { return soundVolume; }

export function setSoundVolume(value) {
  if (!Number.isFinite(value)) return soundVolume;
  soundVolume = Math.max(0, Math.min(1, value));
  try { globalThis.localStorage?.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolume)); } catch (_) {}
  // Changing volume never enables sound or initializes audio by itself.
  stopActiveSounds();
  return soundVolume;
}

function stopActiveSounds() {
  for (const voice of [...activeVoices]) voice.release(true);
}

function isHidden() { return Boolean(globalThis.document?.hidden); }

globalThis.document?.addEventListener("visibilitychange", () => {
  if (isHidden()) stopActiveSounds();
});
globalThis.addEventListener?.("pagehide", stopActiveSounds);

function audioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function loadSoundSetting() {
  try {
    return globalThis.localStorage?.getItem(SOUND_STORAGE_KEY) !== "false";
  } catch (_) {
    return true;
  }
}

function saveSoundSetting(enabled) {
  try {
    globalThis.localStorage?.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch (_) {
    // 保存不可でも、現在のページでは選んだ設定を使う。
  }
}

export function isSoundSupported() {
  return Boolean(audioContextConstructor());
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  saveSoundSetting(soundEnabled);
  if (soundEnabled) unlockSound();
  else stopActiveSounds();
  return soundEnabled;
}

export function unlockSound() {
  if (!soundEnabled || soundVolume === 0 || isHidden()) return null;

  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
      const createdContext = audioContext;
      createdContext.addEventListener?.("statechange", () => {
        if (audioContext === createdContext && createdContext.state !== "running") stopActiveSounds();
      });
    }
    if (audioContext.state !== "running") {
      // Safari can be interrupted without the document becoming hidden.
      stopActiveSounds();
      if (audioContext.state === "suspended" || audioContext.state === "interrupted") {
        void audioContext.resume().catch(() => {});
      }
      return null; // Recovery never replays the cue that requested it.
    }
    return audioContext;
  } catch (_) {
    return null;
  }
}

function canPlay(kind) {
  const now = Date.now();
  const previous = lastPlayedAt.get(kind) || 0;
  if (now - previous < 90) return false;
  lastPlayedAt.set(kind, now);
  return true;
}

function scheduleTone({
  frequency,
  endFrequency = frequency,
  delay = 0,
  duration,
  type,
  volume,
}) {
  const context = unlockSound();
  if (!context) return false;

  let voice;
  let oscillator;
  let gain;
  try {
    // Limit bursts and release old sources before allocating more.
    if (activeVoices.size >= MAX_VOICES) activeVoices.values().next().value.release(true);
    const startAt = context.currentTime + delay;
    const stopAt = startAt + duration;
    oscillator = context.createOscillator();
    gain = context.createGain();
    let released = false;
    voice = { release(stop) {
      if (released) return;
      released = true;
      oscillator.onended = null;
      if (stop) { try { oscillator.stop(); } catch (_) {} }
      try { oscillator.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
      activeVoices.delete(voice);
    } };
    oscillator.onended = () => voice.release(false);
    activeVoices.add(voice);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, stopAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume * soundVolume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.01);
    return true;
  } catch (_) {
    if (voice) voice.release(true);
    else {
      try { oscillator?.stop(); } catch (_) {}
      try { oscillator?.disconnect(); } catch (_) {}
      try { gain?.disconnect(); } catch (_) {}
    }
    return false;
  }
}

export function playCorrectSound() {
  if (!soundEnabled || soundVolume === 0 || isHidden() || !canPlay("correct")) return false;

  const first = scheduleTone({
    frequency: 620,
    endFrequency: 720,
    duration: 0.08,
    type: "sine",
    volume: 0.028,
  });
  scheduleTone({
    frequency: 820,
    endFrequency: 920,
    delay: 0.065,
    duration: 0.11,
    type: "sine",
    volume: 0.032,
  });
  return first;
}

export function playIncorrectSound() {
  if (!soundEnabled || soundVolume === 0 || isHidden() || !canPlay("incorrect")) return false;

  return scheduleTone({
    frequency: 210,
    endFrequency: 125,
    duration: 0.18,
    type: "triangle",
    volume: 0.034,
  });
}
