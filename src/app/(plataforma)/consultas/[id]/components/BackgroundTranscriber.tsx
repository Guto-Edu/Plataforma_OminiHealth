'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Mic, MicOff, Radio } from 'lucide-react';
import {
  startASRWS as startASR,
  stopASRWS as stopASR,
  setTranscriptHandler,
  setInterimTranscriptHandler,
  getTranscriptText,
  resetTranscriptText,
  isSpeechSupported,
} from '@/lib/ws-asr-adapter';
import { useMicStream } from '@/lib/useMicStream';
import VoiceVisualizer from './VoiceVisualizer';

export type TranscriptItem = {
  speaker: 'Medico' | 'Paciente' | 'Transcricao';
  text: string;
};

interface BackgroundTranscriberProps {
  isListening: boolean;
  onToggleListening: () => void;
  onTranscriptUpdate: (item: TranscriptItem) => void;
  contextHint?: string;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function useUserAsrFlag(): { isLoading: boolean } {
  return { isLoading: false };
}

export default function BackgroundTranscriber({
  isListening,
  onToggleListening,
  onTranscriptUpdate,
  contextHint,
}: BackgroundTranscriberProps) {
  const { isLoading } = useUserAsrFlag();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalPreview, setFinalPreview] = useState('');
  const [interimPreview, setInterimPreview] = useState('');
  const [asrError, setAsrError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const { stream, ready, error: micError } = useMicStream(isListening);
  const speechSupported = isSpeechSupported();

  useEffect(() => {
    setTranscriptHandler((text) => {
      setFinalPreview(text);
      onTranscriptUpdate({ speaker: 'Transcricao', text });
    });
    setInterimTranscriptHandler(setInterimPreview);

    return () => {
      setTranscriptHandler(() => {});
      setInterimTranscriptHandler(() => {});
    };
  }, [onTranscriptUpdate]);

  useEffect(() => {
    if (isListening && ready && stream) {
      resetTranscriptText();
      setAsrError(null);
      setFinalPreview('');
      setInterimPreview('');

      startRef.current = Date.now();
      setElapsedMs(0);
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        if (startRef.current) setElapsedMs(Date.now() - startRef.current);
      }, 1000);

      if (!speechSupported) {
        setAsrError('Este navegador nao oferece transcricao nativa por SpeechRecognition.');
      } else {
        void startASR(undefined, stream).catch((err) => {
          setAsrError(err?.message || 'Falha ao iniciar a transcricao nativa.');
        });
      }
    } else {
      void stopASR();

      const full = getTranscriptText();
      if (full) onTranscriptUpdate({ speaker: 'Transcricao', text: full });

      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }

    return () => {
      void stopASR();
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isListening, ready, stream, speechSupported, onTranscriptUpdate]);

  const statusError = micError || asrError;
  const hasText = Boolean(finalPreview || interimPreview);
  const statusText = statusError
    ? statusError
    : isListening
      ? ready
        ? 'Captando voz e montando texto bruto'
        : 'Aguardando permissao do microfone'
      : speechSupported
        ? 'Pronto para iniciar'
        : 'Transcricao nativa indisponivel neste navegador';

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`relative grid h-11 w-11 place-items-center rounded-lg border ${
              isListening ? 'border-teal-200 bg-teal-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <Mic className={`h-5 w-5 ${isListening ? 'text-teal-700' : 'text-gray-500'}`} />
              {isListening && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-teal-500 ring-2 ring-white animate-ping" />
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Transcricao da consulta</h2>
              <div className={`mt-1 flex items-center gap-2 text-sm ${statusError ? 'text-red-600' : 'text-muted'}`}>
                {statusError ? <AlertCircle className="h-4 w-4 shrink-0" /> : isListening ? <Radio className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span className="truncate">{statusText}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onToggleListening}
            disabled={isLoading}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold text-white transition-colors sm:w-auto disabled:opacity-60 ${
              isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-light hover:bg-brand-dark'
            }`}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            {isListening ? 'Parar transcricao' : 'Iniciar transcricao'}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <VoiceVisualizer stream={isListening ? stream : null} className="max-w-none" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 lg:min-w-[170px]">
            <span className="text-sm text-muted">Tempo</span>
            <span className="font-mono text-lg tabular-nums text-gray-900">{formatElapsed(elapsedMs)}</span>
          </div>
        </div>

        <div className="min-h-[84px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Texto bruto em tempo real</p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-800">
            {hasText ? (
              <>
                {finalPreview.split('\n').slice(-2).join(' ')}
                {interimPreview && <span className="text-teal-700"> {interimPreview}</span>}
              </>
            ) : (
              <span className="text-gray-500">O texto reconhecido aparece aqui durante a fala.</span>
            )}
          </p>
          {contextHint && <p className="mt-2 text-xs text-gray-500">{contextHint}</p>}
        </div>
      </div>
    </section>
  );
}
