import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { writeFile } from 'fs/promises';

// Request validation schema
const uploadSchema = z.object({
  vector_store_id: z.string().min(1),
  filename: z.string().min(1),
  file_data: z.string(), // Base64 encoded file data
});

/**
 * POST /api/ai/assistant/upload
 * Upload a knowledge file to OpenAI Assistant vector store
 */
export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    // Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parseResult = uploadSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            details: parseResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { vector_store_id, filename, file_data } = parseResult.data;

    // Decode base64 file data
    const fileBuffer = Buffer.from(file_data, 'base64');

    // Save to temporary file
    tempFilePath = path.join('/tmp', `${Date.now()}_${filename}`);
    await writeFile(tempFilePath, fileBuffer);

    const openai = getOpenAIClient();

    // Upload file to OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(tempFilePath),
      purpose: 'assistants',
    });

    // Attach file to vector store
    await openai.beta.vectorStores.files.create(vector_store_id, {
      file_id: file.id,
    });

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      tempFilePath = null;
    }

    return NextResponse.json({
      success: true,
      data: {
        file_id: file.id,
        filename: file.filename,
        size: file.bytes,
      },
    });
  } catch (error: any) {
    console.error('File upload error:', error);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Failed to clean up temp file:', cleanupError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to upload file',
          code: 'SERVER_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
