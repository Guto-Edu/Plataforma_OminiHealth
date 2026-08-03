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
  'Gere documentos formais em portugues do Brasil.',
  'Nao invente fatos, CID, datas, periodos de afastamento ou justificativas sem base nos dados.',
  'Quando faltar evidencia, prefira comparecimento ou declare insuficiencia.',
].join(' ');

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transcript = sanitizeTranscript(body?.transcript, 14000, body?.useClean !== false);
    const physicalExam = sanitizeText(body?.physicalExam, 5000);
    const vitals = sanitizeText(body?.vitals, 2500);
    const patientHistory = sanitizeText(body?.patientHistory, 5000);

    const prompt = `
TAREFA: gerar apenas o TEXTO do ATESTADO MEDICO, sem cabecalho, rodape, nome do medico, carimbo, nome do paciente ou data.

REGRAS:
- Use somente os dados fornecidos.
- Reformule linguagem leiga da transcricao para linguagem clinica e impessoal.
- Decida entre COMPARECIMENTO e AFASTAMENTO.
- Se faltar evidencia clinica para afastamento, use COMPARECIMENTO e registre: "Sem indicacao de afastamento por falta de elementos clinicos."
- Se houver afastamento, informe periodo somente se houver base clinica clara nos dados.
- Nao citar CID-10 a menos que tenha sido mencionado explicitamente.

FORMATO OBRIGATORIO:
ATESTADO
TIPO: [COMPARECIMENTO | AFASTAMENTO]
PERIODO: [ex.: 24 horas | 2 dias | Nao se aplica]
JUSTIFICATIVA CLINICA:
[1-3 frases tecnicas]
RECOMENDACOES:
[orientacoes concisas; se nao houver: "Sem recomendacoes adicionais."]

<DADOS>
HISTORICO:
${patientHistory || 'Nao fornecido.'}

SINAIS VITAIS:
${vitals || 'Nao fornecidos.'}

TRANSCRICAO BRUTA:
${transcript || 'Nao fornecida.'}

EXAME FISICO:
${physicalExam || 'Nao fornecido.'}
</DADOS>
`.trim();

    const atestado = await withRetries(
      () => generateClinicalText({ system: SYSTEM, prompt, maxOutputTokens: 1200 }),
      2
    );

    return NextResponse.json({ atestado: stripMarkdown(atestado) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
