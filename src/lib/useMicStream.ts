// src/lib/useMicStream.ts
'use client';

import { useEffect, useRef, useState } from 'react';

type UseMicStreamState = {
  stream: MediaStream | null;
  ready: boolean;
  error: string | null;
};

/**
 * Hook de microfone simples e estável:
 * - Ativa quando `isActive` for true.
 * - Reusa o mesmo MediaStream.
 * - Para todos os tracks ao desativar/desmontar.
 */
export function useMicStream(isActive: boolean): UseMicStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestingRef = useRef(false);

  const stopStreamTracks = (m: MediaStream | null) => {
    if (!m) return;
    for (const track of m.getTracks()) {
      try {
        track.stop();
      } catch {}
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function ensureStream() {
      if (!isActive) return;
      if (requestingRef.current) return;

      // se já temos stream, só marcar ready
      if (stream) {
        setReady(true);
        setError(null);
        return;
      }

      requestingRef.current = true;
      setReady(false);
      setError(null);

      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Este navegador nao permite acesso nativo ao microfone.');
        }

        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        };

        const m = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stopStreamTracks(m);
          return;
        }
        setStream(m);
        setReady(true);
        setError(null);
      } catch (err: any) {
        let msg = 'Falha ao acessar o microfone.';
        if (err?.name === 'NotAllowedError') msg = 'Permissão do microfone negada.';
        if (err?.name === 'NotFoundError') msg = 'Nenhum microfone encontrado.';
        if (err?.message) msg += ` ${err.message}`;
        setError(msg);
        setReady(false);
        setStream(null);
      } finally {
        requestingRef.current = false;
      }
    }

    if (isActive) {
      void ensureStream();
    } else {
      // desativou
      if (stream) {
        stopStreamTracks(stream);
        setStream(null);
      }
      setReady(false);
      setError(null);
    }

    return () => {
      cancelled = true;
      if (stream) stopStreamTracks(stream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return { stream, ready, error };
}
