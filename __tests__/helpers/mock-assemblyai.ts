export interface MockAssemblyAIOptions {
  shouldFail?: boolean;
  errorMessage?: string;
  jobId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export function createMockAssemblyAIClient(options: MockAssemblyAIOptions = {}) {
  const {
    shouldFail = false,
    errorMessage = 'Mock AssemblyAI error',
    jobId = 'mock-job-123',
    status = 'queued',
    text = null,
    utterances = null,
  } = options;

  return {
    transcripts: {
      create: jest.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new Error(errorMessage);
        }

        return {
          id: jobId,
          status: status,
        };
      }),
      get: jest.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new Error(errorMessage);
        }

        return {
          id: jobId,
          status: status,
          text: text,
          utterances: utterances,
          error: status === 'error' ? errorMessage : null,
        };
      }),
    },
  };
}

export function createMockTranscriptionJob(
  jobId: string = 'job-123',
  status: 'queued' | 'processing' | 'completed' | 'error' = 'queued'
) {
  return {
    jobId,
    status,
  };
}

export function createMockTranscriptionResult(
  status: 'queued' | 'processing' | 'completed' | 'error' = 'completed',
  text: string = '안녕하세요',
  utterances: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }> = []
) {
  return {
    status,
    text: status === 'completed' ? text : null,
    utterances: status === 'completed' ? utterances : null,
    error: status === 'error' ? 'Transcription failed' : null,
  };
}

export function createMockUtterances() {
  return [
    {
      speaker: 'A',
      text: '안녕하세요',
      start: 0,
      end: 1000,
      confidence: 0.95,
    },
    {
      speaker: 'B',
      text: '반갑습니다',
      start: 1500,
      end: 2500,
      confidence: 0.92,
    },
  ];
}
