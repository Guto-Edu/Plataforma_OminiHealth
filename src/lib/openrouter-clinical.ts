import { lightCleanTranscript } from '@/lib/transcript-post';

type GenerateOptions = {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'google/gemini-2.5-flash-lite';

export function getClinicalModel() {
  return (
    process.env.OPENROUTER_TRANSCRIPTION_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

export function sanitizeText(input: string | undefined | null, max = 8000): string {
  if (!input) return '';
  let t = String(input)
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length > max) t = `${t.slice(0, max)}...`;
  return t;
}

export function sanitizeTranscript(input: string | undefined | null, max = 16000, useClean = true): string {
  if (!input) return '';
  let t = String(input).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (t.length > max) t = t.slice(0, max);
  return useClean
    ? lightCleanTranscript(t, {
        fixDecimals: true,
        attachUnits: true,
        conservativePunctuation: false,
      })
    : t;
}

function extractResponseText(data: any): string {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text === 'string') return text.trim();

  if (Array.isArray(text)) {
    return text
      .map((part: any) => part?.text || part?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

export async function generateClinicalText({
  system,
  prompt,
  maxOutputTokens = 2200,
  signal,
}: GenerateOptions) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY nao configurada.');
  }

  const model = getClinicalModel();
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'OmniHealth',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.15,
      top_p: 0.9,
      max_tokens: maxOutputTokens,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${response.status}: ${detail || 'Erro na comunicacao com a IA.'}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  if (!text) throw new Error('Resposta vazia da IA.');
  return text;
}

export async function withRetries<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 + i * 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha apos tentativas.');
}

export function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\*\*/g, '')
    .replace(/__|~~|`/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
