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
  'Elabore pedidos de exames tecnicos, custo-efetivos e revisaveis pelo medico.',
  'Nao invente diagnosticos fechados, codigos, CID, TUSS ou achados nao fornecidos.',
].join(' ');

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transcript = sanitizeTranscript(body?.transcript, 14000, body?.useClean !== false);
    const physicalExam = sanitizeText(body?.physicalExam, 5000);
    const vitals = sanitizeText(body?.vitals, 2500);
    const patientHistory = sanitizeText(body?.patientHistory, 5000);
    const labResults = sanitizeText(body?.labResults, 5000);

    const prompt = `
TAREFA: gerar apenas o TEXTO do PEDIDO DE EXAMES, sem cabecalho, rodape, medico, paciente ou data.

REGRAS:
- Use somente os dados fornecidos para justificar.
- Pode sugerir exames coerentes com sintomas, sinais vitais, exame fisico, historico e exames previos, mas escreva como "a considerar" quando nao houver solicitacao explicita.
- Priorize exames custo-efetivos e alinhados a hipotese clinica.
- Para cada exame, inclua justificativa breve.
- Nao invente codigos, CID ou preparo se nao houver nos dados.
- Se faltarem dados, declare: "Sem dados suficientes para justificar novos exames."

FORMATO OBRIGATORIO:
HIPOTESE DIAGNOSTICA (HD):
[1-2 linhas; se faltar: "Sem dados suficientes."]

JUSTIFICATIVA CLINICA:
[2-4 linhas vinculando sintomas/achados aos exames]

EXAMES SOLICITADOS:
- [Exame] - [justificativa breve]
[Se for sugestao, escrever: "- [Exame] (a considerar) - [justificativa breve]"]
[Se nenhum exame for indicado: "Sem exames adicionais indicados no momento."]

OBSERVACOES:
[preparo/logistica somente se houver nos dados; caso contrario: "Sem observacoes."]

<DADOS>
HISTORICO:
${patientHistory || 'Nao fornecido.'}

SINAIS VITAIS:
${vitals || 'Nao fornecidos.'}

EXAMES PREVIOS/APRESENTADOS:
${labResults || 'Nenhum.'}

TRANSCRICAO BRUTA:
${transcript || 'Nao fornecida.'}

EXAME FISICO:
${physicalExam || 'Nao fornecido.'}
</DADOS>
`.trim();

    const pedidoExame = await withRetries(
      () => generateClinicalText({ system: SYSTEM, prompt, maxOutputTokens: 1600 }),
      2
    );

    return NextResponse.json({ pedidoExame: stripMarkdown(pedidoExame) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
