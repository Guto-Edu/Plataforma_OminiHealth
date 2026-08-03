import { NextResponse } from 'next/server';
import { generateClinicalText, withRetries } from '@/lib/openrouter-clinical';

type Mode = 'off' | 'light' | 'llm';

function lightCleanup(text: string) {
  let t = (text || '').replace(/\s+/g, ' ').replace(/\s([?!.,;:])/g, '$1').trim();
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function tokenizeBase(s: string) {
  const base = (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tokens = base.match(/[a-z0-9]+/gi) ?? [];
  return new Set(tokens);
}

function addedMeaningfulTokens(original: string, normalized: string) {
  const orig = tokenizeBase(original);
  const norm = tokenizeBase(normalized);

  for (const token of norm) {
    if (!orig.has(token) && token.length >= 4) return true;
  }
  return false;
}

export async function POST(req: Request) {
  let originalText = '';
  try {
    const { text } = await req.json();
    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'Texto ausente.' }, { status: 400 });
    }
    originalText = text;

    const mode = ((process.env.ASR_NORMALIZE_MODE as Mode) || 'off');

    if (mode === 'off') return NextResponse.json({ text });
    if (mode === 'light') return NextResponse.json({ text: lightCleanup(text) });

    const prompt = `
Reescreva o TEXTO apenas corrigindo pontuacao, ortografia e quebras de frase.
- Nao adicione termos medicos novos.
- Nao resuma.
- Nao parafraseie.
- Nao traduza.
- Preserve o conteudo sem mudar sentido.
- Se nao for possivel corrigir sem alterar conteudo, devolva exatamente o texto original.

TEXTO:
${text}
`.trim();

    const out = await withRetries(
      () => generateClinicalText({
        system: 'Voce corrige transcricoes medicas sem adicionar informacao nova.',
        prompt,
        maxOutputTokens: 1200,
      }),
      2
    );

    const normalized = out.trim();
    if (!normalized || addedMeaningfulTokens(text, normalized)) {
      return NextResponse.json({ text }, { status: 200 });
    }

    return NextResponse.json({ text: normalized });
  } catch (e: any) {
    if (e?.message?.includes('OPENROUTER_API_KEY')) {
      return NextResponse.json({ text: originalText }, { status: 200 });
    }
    return NextResponse.json({ error: e?.message || 'Erro interno.' }, { status: 500 });
  }
}
