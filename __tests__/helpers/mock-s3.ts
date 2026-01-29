export interface MockS3Options {
  shouldFail?: boolean;
  errorMessage?: string;
  uploadUrl?: string;
  downloadUrl?: string;
}

export function createMockS3Client(options: MockS3Options = {}) {
  const {
    shouldFail = false,
    errorMessage = 'Mock S3 error',
    uploadUrl = 'https://bucket.s3.ap-northeast-2.amazonaws.com/upload-url',
    downloadUrl = 'https://bucket.s3.ap-northeast-2.amazonaws.com/download-url',
  } = options;

  return {
    send: jest.fn().mockImplementation(async (command: any) => {
      if (shouldFail) {
        throw new Error(errorMessage);
      }

      if (command.constructor.name === 'PutObjectCommand') {
        return { ETag: '"mock-etag"' };
      }

      if (command.constructor.name === 'GetObjectCommand') {
        return { Body: Buffer.from('mock file content') };
      }

      if (command.constructor.name === 'DeleteObjectCommand') {
        return { DeleteMarker: true };
      }

      return {};
    }),
  };
}

export async function createMockPresignedUrl(
  type: 'upload' | 'download' = 'upload',
  options: MockS3Options = {}
): Promise<string> {
  const { uploadUrl, downloadUrl } = options;

  if (type === 'upload') {
    return uploadUrl || 'https://bucket.s3.ap-northeast-2.amazonaws.com/upload-url';
  }

  return downloadUrl || 'https://bucket.s3.ap-northeast-2.amazonaws.com/download-url';
}

export function createMockS3UploadResponse() {
  return {
    uploadUrl: 'https://bucket.s3.ap-northeast-2.amazonaws.com/cards/user-123/1234567890_business_card.jpg',
    publicUrl: 'https://bucket.s3.ap-northeast-2.amazonaws.com/cards/user-123/1234567890_business_card.jpg',
    key: 'cards/user-123/1234567890_business_card.jpg',
  };
}

export function createMockS3DeleteResponse() {
  return {
    DeleteMarker: true,
    VersionId: 'mock-version-id',
  };
}
