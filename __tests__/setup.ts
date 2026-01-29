beforeAll(() => {
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'mock-service-key';
  process.env.OPENAI_API_KEY = 'mock-openai-key';
  process.env.AWS_REGION = 'ap-northeast-2';
  process.env.AWS_ACCESS_KEY_ID = 'mock-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';
  process.env.AWS_S3_BUCKET = 'mock-bucket';
  process.env.ASSEMBLYAI_API_KEY = 'mock-assemblyai-key';
  process.env.DEEPGRAM_API_KEY = 'mock-deepgram-key';
});

afterEach(() => {
  jest.clearAllMocks();
});
