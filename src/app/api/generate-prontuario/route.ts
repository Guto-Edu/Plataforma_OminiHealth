import { NextResponse } from 'next/server';
import {
  generateClinicalText,
  getClinicalModel,
  sanitizeText,
  sanitizeTranscript,
  stripMarkdown,
  withRetries,
} from '@/lib/openrouter-clinical';

const SYSTEM = [
  'Voce e um assistente clinico para medicos no Brasil.',
  'Redija documentos tecnicos em portugues do Brasil.',
  'Use somente os dados fornecidos. Nao invente sintomas, exame fisico, diagnosticos fechados, CID, doses ou condutas factuais.',
  'Quando fizer sugestoes, identifique como proposta a revisar pelo medico.',
  'O texto sera revisado por um medico antes de uso oficial.',
].join(' ');

function buildPrompt(payload: {
  transcript: string;
  physicalExam: string;
  vitals: string;
  patientHistory: string;
  labResults: string;
}) {
  return `
TAREFA: gerar PRONTUARIO em formato SOAP, sem markdown, sem cabecalho, sem rodape, sem assinatura.

REGRAS CRITICAS:
- Use SOMENTE os dados dentro de <DADOS>.
- Se um campo nao tiver informacao, escreva exatamente: "Sem dados disponiveis."
- Normalize a transcricao: transforme fala coloquial em linguagem clinica, sem acrescentar fatos.
- Se houver conflito entre dados, registre em AVALIACAO: "Inconsistencias a revisar: ...".
- Nao prescreva farmacos especificos se eles nao estiverem nos dados.
- Se nao houver plano explicito, crie "Plano proposto (a revisar)" com medidas gerais, exames a considerar, sinais de alarme, retorno e encaminhamento quando coerente.

FORMATO EXATO:
SUBJETIVO:
[queixa principal, HDA, sintomas associados, antecedentes relevantes]

OBJETIVO:
- SINAIS VITAIS: [texto]
- EXAME FISICO: [texto]
- EXAMES COMPLEMENTARES: [texto]

AVALIACAO:
[hipotese principal quando sustentada, diferenciais, gravidade, limitacoes e inconsistencias]

PLANO:
[condutas relatadas e/ou Plano proposto (a revisar)]

<DADOS>
HISTORICO:
${payload.patientHistory || 'Sem dados disponiveis.'}

SINAIS VITAIS:
${payload.vitals || 'Sem dados disponiveis.'}

EXAMES APRESENTADOS:
${payload.labResults || 'Sem dados disponiveis.'}

TRANSCRICAO BRUTA:
${payload.transcript || 'Sem dados disponiveis.'}

EXAME FISICO:
${payload.physicalExam || 'Sem dados disponiveis.'}
</DADOS>
`.trim();
}

function enforceSOAPShape(text: string): string {
  const sections = ['SUBJETIVO', 'OBJETIVO', 'AVALIACAO', 'PLANO'];
  let out = stripMarkdown(text)
    .replace(/^\s*subjetivo\s*:/im, 'SUBJETIVO:')
    .replace(/^\s*objetivo\s*:/im, 'OBJETIVO:')
    .replace(/^\s*avalia[cç][aã]o\s*:/im, 'AVALIACAO:')
    .replace(/^\s*plano\s*:/im, 'PLANO:')
    .replace(/- *sinais vitais\s*:/i, '- SINAIS VITAIS:')
    .replace(/- *exame f[ií]sico\s*:/i, '- EXAME FISICO:')
    .replace(/- *exames complementares\s*:/i, '- EXAMES COMPLEMENTARES:');

  for (const section of sections) {
    const re = new RegExp(`\\b${section}\\s*:`, 'i');
    if (!re.test(out)) {
      if (section === 'OBJETIVO') {
        out += '\n\nOBJETIVO:\n- SINAIS VITAIS: Sem dados disponiveis.\n- EXAME FISICO: Sem dados disponiveis.\n- EXAMES COMPLEMENTARES: Sem dados disponiveis.';
      } else {
        out += `\n\n${section}:\nSem dados disponiveis.`;
      }
    }
  }

  return out.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transcript = sanitizeTranscript(body?.transcript, 16000, body?.useClean !== false);
    const physicalExam = sanitizeText(body?.physicalExam, 6000);
    const vitals = sanitizeText(body?.vitals, 2500);
    const patientHistory = sanitizeText(body?.patientHistory, 5000);
    const labResults = sanitizeText(body?.labResults, 5000);

    console.log('GEN-PRONTUARIO INPUT', {
      model: getClinicalModel(),
      transcriptLength: transcript.length,
      physicalExamLength: physicalExam.length,
      vitalsLength: vitals.length,
      patientHistoryLength: patientHistory.length,
      labResultsLength: labResults.length,
    });

    const prompt = buildPrompt({ transcript, physicalExam, vitals, patientHistory, labResults });
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 60_000);

    let raw = '';
    try {
      raw = await withRetries(
        () => generateClinicalText({ system: SYSTEM, prompt, maxOutputTokens: 3000, signal: ctrl.signal }),
        2
      );
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ prontuario: enforceSOAPShape(raw) });
  } catch (error: any) {
    console.error('GEN-PRONTUARIO ERROR', error);
    const fallback = `SUBJETIVO:
Sem dados disponiveis.

OBJETIVO:
- SINAIS VITAIS: Sem dados disponiveis.
- EXAME FISICO: Sem dados disponiveis.
- EXAMES COMPLEMENTARES: Sem dados disponiveis.

AVALIACAO:
Sem dados suficientes para hipoteses robustas.

PLANO:
Plano proposto (gerado por IA) - submeter a revisao medica.
- Reavaliacao clinica conforme disponibilidade do servico.
- Orientacoes gerais de sinais de alarme e retorno imediato em caso de piora.`;

    return NextResponse.json(
      { prontuario: fallback, warning: String(error?.message || 'Erro desconhecido').slice(0, 500) },
      { status: 500 }
    );
  }
}
