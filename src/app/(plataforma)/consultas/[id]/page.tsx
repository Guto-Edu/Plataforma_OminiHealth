// src/app/(plataforma)/consultas/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { getTranscriptText, resetTranscriptText } from '@/lib/ws-asr-adapter';
import type { TranscriptItem } from './components/BackgroundTranscriber';

const BackgroundTranscriber = dynamic(
  () => import('./components/BackgroundTranscriber'),
  { ssr: false }
); 
import PhysicalExamForm from './components/PhysicalExamForm';
import PatientSummary from './components/PatientSummary';
import VitalSignsForm from './components/VitalSignsForm';
import DocumentSection from './components/DocumentSection';
import LabResultsForm from './components/LabResultsForm';
import EditPatientDataModal from './components/EditPatientDataModal';

// Tipos
type ExamFindings = Record<string, string[]>;
type DocumentsState = { prontuario: string; receita: string; atestado: string; pedidoExame: string; };
type EditingField = 'medical_history' | 'allergies' | 'medications' | null;

export default function ConsultationDetailPage() {
  const [profile, setProfile] = useState<any | null>(null);
  const [patient, setPatient] = useState<any | null>(null);
  const [vitals, setVitals] = useState<any>({});
  const [lastVitals, setLastVitals] = useState<any | null>(null);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [physicalExamData, setPhysicalExamData] = useState<ExamFindings>({});

  const [documents, setDocuments] = useState<DocumentsState>({ prontuario: '', receita: '', atestado: '', pedidoExame: '' });
  const [isGenerating, setIsGenerating] = useState<keyof DocumentsState | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [consultationDate, setConsultationDate] = useState<string | null>(null);

  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const id = params.id as string;

  // Evita setState após unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Carregamento inicial com abort/guards
  useEffect(() => {
    if (!id) return;

    const ctrl = new AbortController();
    const getInitialData = async () => {
      try {
        setLoading(true);

        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) {
          if (mountedRef.current) router.push('/login');
          return;
        }

        // Consulta atual
        const { data: consultationData, error: consultationError } = await supabase
          .from('consultas')
          .select(`*, patient_id`)
          .eq('id', id)
          .single();

        if (consultationError || !consultationData) {
          toast.error('Consulta não encontrada.');
          if (mountedRef.current) router.push('/consultas');
          return;
        }

        // Paciente
        const { data: patientData, error: patientErr } = await supabase
          .from('patients')
          .select('*')
          .eq('id', consultationData.patient_id)
          .single();
        if (patientErr) throw patientErr;

        // Perfil
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileErr) throw profileErr;

        // Últimos vitais em consulta concluída
        const { data: lastConsultation, error: lastErr } = await supabase
          .from('consultas')
          .select('vitals_and_anthropometry')
          .eq('patient_id', consultationData.patient_id)
          .eq('status', 'concluída')
          .neq('id', id) // Exclui a consulta atual
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastErr) {
          // Não é crítico — apenas loga
          console.warn('Falha ao carregar últimos vitais:', lastErr.message);
        }

        if (!mountedRef.current || ctrl.signal.aborted) return;

        setProfile(profileData ?? null);
        setPatient(patientData ? { ...patientData, consultation_id: id } : null);
        setVitals(consultationData.vitals_and_anthropometry || {});
        setLastVitals(lastConsultation?.vitals_and_anthropometry || null);
        setLabResults(consultationData.lab_results || []);

        setDocuments({
          prontuario: consultationData.prontuario_gerado || '',
          receita: consultationData.receita_gerada || '',
          atestado: consultationData.atestado_gerado || '',
          pedidoExame: consultationData.pedido_exame_gerado || '',
        });

        // guarda a data da consulta (created_at) para salvar junto com a transcrição
        setConsultationDate(consultationData.created_at ?? new Date().toISOString());

        if (consultationData.status === 'concluída') setIsFinalized(true);
      } catch (err: any) {
        console.error(err);
        toast.error(`Erro ao carregar consulta: ${err?.message || 'desconhecido'}`);
      } finally {
        if (mountedRef.current && !ctrl.signal.aborted) setLoading(false);
      }
    };

    void getInitialData();
    return () => { ctrl.abort(); };
  }, [id, router, supabase]);

  // ===== Handlers MEMOIZADOS =====
  const handleDataSave = useCallback(({ patient: updatedPatient, vitals: updatedVitals }: any) => {
    setPatient(updatedPatient);
    setVitals(updatedVitals);
  }, []);

  const handleTranscriptUpdate = useCallback((newItem: TranscriptItem) => {
    setTranscript(newItem.text ? [newItem] : []);
  }, []);

  const handleExamDataChange = useCallback((data: ExamFindings) => {
    setPhysicalExamData(data);
  }, []);

  // Junta dados contextuais para geração e para persistência da transcrição (memo p/ evitar recomputar)
  const baseGenerationData = useMemo(() => {
    const fullTranscriptText = transcript.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
    const examText = Object.entries(physicalExamData)
      .map(([cat, find]) => `${cat}:\n- ${find.join('\n- ')}`)
      .join('\n\n');
    const vitalsText = Object.entries(vitals)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`)
      .join(' | ');

    const patientHistoryText = `
      Doenças Pré-existentes: ${patient?.medical_history?.map((d: any) => `${d.code} - ${d.description}`).join(', ') || 'Nenhuma'}
      Alergias: ${patient?.allergies || 'Nenhuma'}
      Medicação de Uso Contínuo: ${patient?.medications || 'Nenhuma'}
    `.trim();

    const labResultsText = labResults.map(res => `${res.name}: ${res.value}`).join('\n');

    return { fullTranscriptText, examText, vitalsText, patientHistoryText, labResultsText };
  }, [transcript, physicalExamData, vitals, patient, labResults]);

  const handleGenerateDocument = useCallback(async (docType: keyof DocumentsState) => {
    // Pega direto do adapter
    const fullTranscriptTextAdapter = getTranscriptText().trim();

    if (!fullTranscriptTextAdapter && Object.keys(physicalExamData).length === 0) {
      toast.error('A transcrição e o exame físico estão vazios.');
      return;
    }

    setIsGenerating(docType);
    const { fullTranscriptText, examText, vitalsText, patientHistoryText, labResultsText } = baseGenerationData;
    const transcriptForAi = fullTranscriptTextAdapter || fullTranscriptText;

    try {

      // 🔍 DEBUG FRONT — antes de enviar pra API
      const rawTranscript = transcriptForAi;

      console.log('🎙️ FRONT → API', {
        length: rawTranscript?.length ?? 0,
        preview: rawTranscript?.slice(0, 200),
        examSize: examText.length,
        vitalsSize: vitalsText.length,
      });

      const response = await fetch(`/api/generate-${docType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: id,
          transcript: transcriptForAi,
          patientName: patient?.full_name || 'Paciente',
          physicalExam: examText,
          vitals: vitalsText,
          patientHistory: patientHistoryText,
          labResults: labResultsText,
          useClean: true,  
        }),
      });
      if (!response.ok) throw new Error(`Falha ao gerar ${docType}.`);

      const data = await response.json();
      const documentContent = data[docType];

      setDocuments(prev => ({ ...prev, [docType]: documentContent }));
      toast.success(`${docType.charAt(0).toUpperCase() + docType.slice(1)} gerado com sucesso!`);
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsGenerating(null);
    }
  }, [baseGenerationData, id, patient?.full_name, physicalExamData, transcript.length]);

  // --- salvar a transcrição bruta (1:1 por consulta) ---
  const saveTranscriptToDB = useCallback(async (fullTranscriptText: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    if (!id) throw new Error('Consulta inválida');

    const payload = {
      user_id: user.id,
      consultation_id: id,
      patient_id: patient?.id,
      patient_name: patient?.full_name ?? 'Paciente',
      consultation_date: consultationDate ?? new Date().toISOString(),
      transcript_text: fullTranscriptText,
    };

    const { error } = await supabase
      .from('consultation_transcripts')
      .upsert(payload, { onConflict: 'consultation_id' });

    if (error) throw error;
  }, [consultationDate, id, patient, supabase]);

  const handleFinalizeConsultation = useCallback(async () => {
    if (!documents.prontuario) { toast.error('Gere o prontuário antes de finalizar.'); return; }
    setIsFinalizing(true);
    try {
      if (isListening) {
        setIsListening(false);
        await new Promise(r => setTimeout(r, 600));
      }

      const fullTranscriptText = getTranscriptText();   // ⬅️ pega do adapter
      await saveTranscriptToDB(fullTranscriptText);

      const { error } = await supabase
        .from('consultas')
        .update({
          prontuario_gerado: documents.prontuario,
          receita_gerada: documents.receita,
          atestado_gerado: documents.atestado,
          pedido_exame_gerado: documents.pedidoExame,
          vitals_and_anthropometry: vitals,
          lab_results: labResults,
          status: 'concluída',
        })
        .eq('id', id);

      if (error) throw error;

      setIsFinalized(true);
      toast.success('Consulta finalizada e guardada com sucesso!');
      router.refresh();
    } catch (error: any) {
      toast.error(`Erro ao finalizar a consulta: ${error.message}`);
    } finally {
      setIsFinalizing(false);
    }
  }, [baseGenerationData, documents, id, isListening, labResults, router, saveTranscriptToDB, supabase, vitals]);

  // [ADD] — ref para evitar writes redundantes a cada 30s
  const lastSavedRef = useRef<string>(''); // [ADD]

  // [ADD] — snapshot periódico (texto cru) durante a gravação
  useEffect(() => { // [ADD]
    if (!isListening) return;
    const int = window.setInterval(async () => {
      const snap = getTranscriptText();
      if (!snap || snap === lastSavedRef.current) return;
      try {
        await saveTranscriptToDB(snap); // upsert 1:1 (consultation_id)
        lastSavedRef.current = snap;
      } catch (e) {
        console.warn('Falha snapshot transcrição:', (e as any)?.message || e);
      }
    }, 30_000); // 30s
    return () => window.clearInterval(int);
  }, [isListening, saveTranscriptToDB]); // [ADD]

  // Navegar para /consultas também via onClick para contornar overlays
  const handleGoBack = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault?.();
      router.push('/consultas');
    },
    [router]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-light" />
      </div>
    );
  }

  return (
    <>
      {/* z-index e pointer-events garantem clique mesmo se algum overlay global existir */}
      <div className="mt-16 relative z-10 pointer-events-auto">
        <div className="mb-6 flex items-center gap-2">
          <Link
            href="/consultas"
            prefetch={false}
            className="flex items-center gap-2 text-muted hover:text-foreground"
            onClick={handleGoBack}
          >
            <ArrowLeft className="h-5 w-5" />
            Voltar para Consultas
          </Link>
        </div>

        <div className="space-y-8">
          {patient && (
            <PatientSummary
              patient={patient}
              lastVitals={lastVitals}
              onEditClick={(field: EditingField) => setEditingField(field)}
            />
          )}

          {!isFinalized && (
            <>
              <VitalSignsForm
                vitals={vitals}
                setVitals={setVitals}
                isFinalized={isFinalized}
              />
              <LabResultsForm
                results={labResults}
                onResultsChange={setLabResults}
                isFinalized={isFinalized}
              />

              <BackgroundTranscriber
                isListening={isListening}
                onToggleListening={() => {
                  setIsListening((v) => {
                    if (!v) {
                      // Vai começar a gravar → zera buffer
                      resetTranscriptText();
                      console.log('🧹 Transcript resetado');
                    }
                    return !v;
                  });
                }}
                onTranscriptUpdate={handleTranscriptUpdate}
              />

              {/* Usa callback memoizado para evitar loops no filho */}
              <PhysicalExamForm onExamDataChange={handleExamDataChange} />
            </>
          )}

          <DocumentSection
            documents={documents}
            setDocuments={setDocuments}
            isGenerating={isGenerating}
            isFinalized={isFinalized}
            isFinalizing={isFinalizing}
            onGenerate={handleGenerateDocument}
            onFinalize={handleFinalizeConsultation}
            profile={profile}
            patientName={patient?.full_name ?? ''}
          />
        </div>
      </div>

      <EditPatientDataModal
        isOpen={!!editingField}
        onClose={() => setEditingField(null)}
        patient={patient}
        fieldToEdit={editingField}
        onSaveSuccess={(updatedPatient: any) => setPatient(updatedPatient)}
      />
    </>
  );
}
