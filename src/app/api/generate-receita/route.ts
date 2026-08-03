import { NextResponse } from 'next/server';
import {
  generateClinicalText,
  sanitizeText,
  sanitizeTranscript,
  stripMarkdown,
  withRetries,
} from '@/lib/openrouter-clinical';

const SYSTEM = [
  'Voce e um assistente clinico para medicos no Brasil.',
  'Receitas medicas exigem cautela maxima.',
  'Nao invente medicamentos, dose, via, frequencia, duracao ou quantidade.',
  'Se faltar informacao, retorne que nao ha dados suficientes para prescricao segura.',
].join(' ');

function sanitizeRecipe(text: string): string {
  let out = stripMarkdown(text);

  out = out
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n\s*Uso\s+([^\n:]+)\s*:\s*/i, '\nUso $1:\n')
    .replace(
      /^(\d+\.\s.*?)(?:\s*[-\u2013\u2014]{3,}\s*|\s{2,})(\d+\s*(?:caixa|caixas|frasco|frascos|ampola|ampolas|unidade|unidades|comprimido|comprimidos))\s*$/gmi,
      (_m, a, b) => `${a} ------------------------------------------------${b}`
    )
    .trim();

  if (!out.startsWith('Receita')) out = `Receita\n\n${out}`;
  if (!/^Receita\s*$/m.test(out.split('\n')[0]?.trim() || '')) {
    out = 'Receita\n\nSem dados suficientes para prescricao segura.';
  }
  return out.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transcript = sanitizeTranscript(body?.transcript, 14000, body?.useClean !== false);
    const physicalExam = sanitizeText(body?.physicalExam, 5000);
    const patientHistory = sanitizeText(body?.patientHistory, 5000);

    const prompt = `
TAREFA: gerar apenas o TEXTO da RECEITA MEDICA, sem cabecalho, rodape, medico, paciente ou data.

REGRAS DE SEGURANCA:
- Nao crie medicamento se ele nao foi explicitamente mencionado nos dados.
- Considere alergias, medicacoes em uso e comorbidades em HISTORICO.
- Se houver contraindicao explicita ou duvida relevante, escreva "ALERTA: possivel contraindicacao - revisar." no lugar do item.
- Se faltar dose, via, frequencia, duracao ou quantidade para prescrever com seguranca, retorne "Sem dados suficientes para prescricao segura."
- Usar DCB/nome generico quando constar nos dados.
- Sem abreviacoes ambiguas: prefira "via oral" em vez de "VO".

FORMATO OBRIGATORIO:
Receita

Uso oral:
1. {Medicamento} {concentracao} ------------------------------------------------{quantidade}
Tomar {numero} {forma} via oral {frequencia} por {duracao}

[Se houver mais itens, continue 2., 3. Se via nao for oral, troque por "Uso {via}:".]

Se nao houver dados suficientes:
Receita

Sem dados suficientes para prescricao segura.

<DADOS>
HISTORICO:
${patientHistory || 'Nao fornecido.'}

TRANSCRICAO BRUTA:
${transcript || 'Nao fornecida.'}

EXAME FISICO:
${physicalExam || 'Nao fornecido.'}
</DADOS>
`.trim();

    const receita = await withRetries(
      () => generateClinicalText({ system: SYSTEM, prompt, maxOutputTokens: 1000 }),
      2
    );

    return NextResponse.json({ receita: sanitizeRecipe(receita) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
