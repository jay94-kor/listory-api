import { TranscriptStatus } from 'assemblyai';
import {
  getAssemblyAIClient,
  startTranscription,
  getTranscriptionResult,
  getStatusMessage,
} from '@/lib/assemblyai';

jest.mock('assemblyai', () => {
  const mockCreate = jest.fn();
  const mockGet = jest.fn();

  return {
    AssemblyAI: jest.fn().mockImplementation(() => ({
      transcripts: {
        create: mockCreate,
        get: mockGet,
      },
    })),
    __mockCreate: mockCreate,
    __mockGet: mockGet,
  };
});

describe('AssemblyAI Library', () => {
  let mockCreate: jest.Mock;
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const assemblyaiMock = require('assemblyai');
    mockCreate = assemblyaiMock.__mockCreate;
    mockGet = assemblyaiMock.__mockGet;
  });

  describe('getAssemblyAIClient', () => {
    it('should return an AssemblyAI client instance', () => {
      const client = getAssemblyAIClient();
      expect(client).toBeDefined();
      expect(client.transcripts).toBeDefined();
    });

    it('should return singleton instance on subsequent calls', () => {
      const client1 = getAssemblyAIClient();
      const client2 = getAssemblyAIClient();
      expect(client1).toBe(client2);
    });
  });

  describe('startTranscription', () => {
    it('should start transcription with default parameters', async () => {
      mockCreate.mockResolvedValue({
        id: 'job-123',
        status: 'queued',
      });

      const result = await startTranscription('https://example.com/audio.wav');

      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe('queued');
      expect(mockCreate).toHaveBeenCalledWith({
        audio_url: 'https://example.com/audio.wav',
        language_code: 'ko',
        speaker_labels: true,
        punctuate: true,
        format_text: true,
      });
    });

    it('should use custom language code', async () => {
      mockCreate.mockResolvedValue({
        id: 'job-456',
        status: 'queued',
      });

      await startTranscription('https://example.com/audio.wav', 'en');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          language_code: 'en',
        })
      );
    });

    it('should allow disabling speaker diarization', async () => {
      mockCreate.mockResolvedValue({
        id: 'job-789',
        status: 'queued',
      });

      await startTranscription('https://example.com/audio.wav', 'ko', false);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          speaker_labels: false,
        })
      );
    });
  });

  describe('getTranscriptionResult', () => {
    it('should return completed transcription result', async () => {
      mockGet.mockResolvedValue({
        id: 'job-123',
        status: 'completed',
        text: '안녕하세요',
        utterances: [
          { speaker: 'A', text: '안녕하세요', start: 0, end: 1000, confidence: 0.95 },
        ],
        error: null,
      });

      const result = await getTranscriptionResult('job-123');

      expect(result.status).toBe('completed');
      expect(result.text).toBe('안녕하세요');
      expect(result.utterances).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should handle queued status', async () => {
      mockGet.mockResolvedValue({
        id: 'job-123',
        status: 'queued',
        text: null,
        utterances: null,
        error: null,
      });

      const result = await getTranscriptionResult('job-123');

      expect(result.status).toBe('queued');
      expect(result.text).toBeNull();
      expect(result.utterances).toBeNull();
    });

    it('should handle error status', async () => {
      mockGet.mockResolvedValue({
        id: 'job-123',
        status: 'error',
        text: null,
        utterances: null,
        error: 'Audio could not be processed',
      });

      const result = await getTranscriptionResult('job-123');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Audio could not be processed');
    });

    it('should handle undefined utterances', async () => {
      mockGet.mockResolvedValue({
        id: 'job-123',
        status: 'completed',
        text: '안녕하세요',
        utterances: undefined,
        error: null,
      });

      const result = await getTranscriptionResult('job-123');

      expect(result.utterances).toBeNull();
    });
  });

  describe('getStatusMessage', () => {
    it('should return Korean message for queued status', () => {
      expect(getStatusMessage('queued' as TranscriptStatus)).toBe('대기 중');
    });

    it('should return Korean message for processing status', () => {
      expect(getStatusMessage('processing' as TranscriptStatus)).toBe('처리 중');
    });

    it('should return Korean message for completed status', () => {
      expect(getStatusMessage('completed' as TranscriptStatus)).toBe('완료');
    });

    it('should return Korean message for error status', () => {
      expect(getStatusMessage('error' as TranscriptStatus)).toBe('오류 발생');
    });

    it('should return original status for unknown status', () => {
      expect(getStatusMessage('unknown' as TranscriptStatus)).toBe('unknown');
    });
  });
});
