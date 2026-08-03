'use client';

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  0?: SpeechRecognitionAlternative;
  item: (i: number) => SpeechRecognitionAlternative;
};
type SpeechRecognitionResultList = {
  length: number;
  item: (i: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};
type SpeechRecognitionEventLike = Event & {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEventLike) => any) | null;
  onerror: ((this: ISpeechRecognition, ev: any) => any) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => ISpeechRecognition;
export type Handler = (text: string) => void;

const LANG = 'pt-BR';
const CHUNK_MS = 25_000;
const RESTART_PAUSE_MS = 350;
const RECENT_FINALS_MAX = 10;

let handler: Handler = () => {};
let interimHandler: Handler = () => {};
let accText = '';
let interimText = '';
let running = false;
let recognition: ISpeechRecognition | null = null;
let chunkTimer: number | null = null;
let restartTimer: number | null = null;
let stoppingSoft = false;
let restartAttempts = 0;
const recentFinals: string[] = [];

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (!w) return null;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;
}

export const isSpeechSupported = () => !!getSpeechRecognitionCtor();
export const getTranscriptText = () => accText;
export const getInterimTranscriptText = () => interimText;

export function setTranscriptHandler(fn: Handler) {
  handler = fn || (() => {});
}

export function setInterimTranscriptHandler(fn: Handler) {
  interimHandler = fn || (() => {});
}

export function resetTranscriptText() {
  accText = '';
  interimText = '';
  recentFinals.length = 0;
  try {
    handler('');
    interimHandler('');
  } catch {}
}

function clearChunkTimer() {
  if (chunkTimer) window.clearTimeout(chunkTimer);
  chunkTimer = null;
}

function clearRestartTimer() {
  if (restartTimer) window.clearTimeout(restartTimer);
  restartTimer = null;
}

function appendFinal(text: string) {
  const clean = text.trim();
  if (!clean) return;

  const last = recentFinals[recentFinals.length - 1];
  if (last === clean) return;

  recentFinals.push(clean);
  if (recentFinals.length > RECENT_FINALS_MAX) recentFinals.shift();

  accText = accText ? `${accText}\n${clean}` : clean;
  try {
    handler(accText);
  } catch {}
}

function scheduleChunkCut() {
  clearChunkTimer();
  chunkTimer = window.setTimeout(() => {
    if (!recognition || !running) return;
    stoppingSoft = true;
    try {
      recognition.stop();
    } catch {}
  }, CHUNK_MS);
}

function createRecognition(): ISpeechRecognition {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) throw new Error('SpeechRecognition nao e suportado neste navegador.');

  const rec = new Ctor();
  rec.lang = LANG;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (ev: SpeechRecognitionEventLike) => {
    let partial = '';

    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results.item(i);
      const alt = result?.[0] ?? result?.item(0);
      const text = String(alt?.transcript || '').trim();
      if (!text) continue;

      if (result.isFinal) appendFinal(text);
      else partial += partial ? ` ${text}` : text;
    }

    interimText = partial.trim();
    try {
      interimHandler(interimText);
    } catch {}
  };

  rec.onerror = (ev: any) => {
    const err = String(ev?.error || '');
    if (err === 'aborted') return;

    if (err === 'not-allowed' || err === 'service-not-allowed') {
      running = false;
      clearChunkTimer();
      clearRestartTimer();
      console.warn('[ASR:nativo] permissao do microfone negada ou bloqueada.');
      return;
    }

    if (err !== 'no-speech' && err !== 'network' && err !== 'audio-capture') {
      console.warn('[ASR:nativo] erro:', err, ev?.message || '');
    }
  };

  rec.onend = () => {
    if (!running) return;

    clearChunkTimer();
    clearRestartTimer();

    const delay = Math.min(1500, (stoppingSoft ? RESTART_PAUSE_MS : 500) + restartAttempts * 200);
    restartTimer = window.setTimeout(() => {
      try {
        recognition?.start();
        restartAttempts = 0;
        scheduleChunkCut();
      } catch {
        restartAttempts += 1;
        restartTimer = window.setTimeout(() => {
          try {
            recognition?.start();
            restartAttempts = 0;
            scheduleChunkCut();
          } catch {}
        }, 600);
      }
    }, delay);

    stoppingSoft = false;
  };

  return rec;
}

export async function startASRWS(_serverUrl?: string, _stream?: MediaStream) {
  if (running) return;
  if (!isSpeechSupported()) {
    throw new Error('Este navegador nao suporta SpeechRecognition.');
  }

  running = true;
  restartAttempts = 0;
  resetTranscriptText();
  recognition = createRecognition();

  try {
    recognition.start();
    scheduleChunkCut();
  } catch (e) {
    running = false;
    recognition = null;
    clearChunkTimer();
    throw e;
  }
}

export async function stopASRWS() {
  if (!running) return;
  running = false;
  interimText = '';
  clearChunkTimer();
  clearRestartTimer();
  try {
    interimHandler('');
    recognition?.stop();
  } catch {}
  recognition = null;
}
