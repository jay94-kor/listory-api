import { AssemblyAI, TranscriptStatus } from 'assemblyai';

// AssemblyAI client singleton
let assemblyClient: AssemblyAI | null = null;

export function getAssemblyAIClient(): AssemblyAI {
  if (!assemblyClient) {
    assemblyClient = new AssemblyAI({
      apiKey: process.env.ASSEMBLY_AI_API_KEY!,
    });
  }
  return assemblyClient;
}

// Start async transcription
export async function startTranscription(
  audioUrl: string,
  language: string = 'ko',
  enableDiarization: boolean = true
): Promise<{ jobId: string; status: string }> {
  const client = getAssemblyAIClient();

  const transcript = await client.transcripts.create({
    audio_url: audioUrl,
    language_code: language as 'ko' | 'en',
    speaker_labels: enableDiarization,
    punctuate: true,
    format_text: true,
  });

  return {
    jobId: transcript.id,
    status: transcript.status,
  };
}

// Get transcription status and result
export async function getTranscriptionResult(jobId: string): Promise<{
  status: TranscriptStatus;
  text: string | null;
  utterances: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }> | null;
  error: string | null;
}> {
  const client = getAssemblyAIClient();
  const transcript = await client.transcripts.get(jobId);

  return {
    status: transcript.status,
    text: transcript.text || null,
    utterances: transcript.utterances?.map((u) => ({
      speaker: u.speaker,
      text: u.text,
      start: u.start,
      end: u.end,
      confidence: u.confidence,
    })) || null,
    error: transcript.error || null,
  };
}

// Map status to human-readable Korean
export function getStatusMessage(status: TranscriptStatus): string {
  const messages: Record<TranscriptStatus, string> = {
    queued: '대기 중',
    processing: '처리 중',
    completed: '완료',
    error: '오류 발생',
  };
  return messages[status] || status;
}
