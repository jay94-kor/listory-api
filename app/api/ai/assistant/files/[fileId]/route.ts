import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';

/**
 * DELETE /api/ai/assistant/files/:fileId
 * Delete a knowledge file from OpenAI
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    // Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }

    const { fileId } = params;

    if (!fileId || fileId.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'File ID is required', code: 'VALIDATION_ERROR' },
        },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();

    // Get vector_store_id from query params if provided
    const { searchParams } = new URL(request.url);
    const vectorStoreId = searchParams.get('vector_store_id');

    // If vector store ID provided, remove file from vector store first
    if (vectorStoreId) {
      try {
        await openai.vectorStores.files.del(vectorStoreId, fileId);
      } catch (error) {
        console.warn('Failed to remove file from vector store:', error);
        // Continue to delete file even if vector store removal fails
      }
    }

    // Delete file from OpenAI
    await openai.files.del(fileId);

    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        file_id: fileId,
      },
    });
  } catch (error: any) {
    console.error('File deletion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to delete file',
          code: 'SERVER_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
