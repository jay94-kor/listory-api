import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';

/**
 * Check Vector Store indexing status
 * POST /api/ai/assistant/check-indexing
 *
 * Request body:
 * {
 *   "vector_store_id": "vs_xxxxx"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "is_complete": true,
 *     "in_progress": 0,
 *     "completed": 3,
 *     "failed": 0
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vector_store_id } = body;

    if (!vector_store_id) {
      return NextResponse.json({
        success: false,
        error: { message: 'vector_store_id is required' },
      }, { status: 400 });
    }

    const openai = getOpenAIClient();

    // Retrieve Vector Store to check file counts
    const vectorStore = await openai.vectorStores.retrieve(vector_store_id);

    // Check file counts
    const { in_progress, completed, failed } = vectorStore.file_counts;

    console.log(`📊 Vector Store ${vector_store_id}: ${completed} completed, ${in_progress} in progress, ${failed} failed`);

    if (failed > 0) {
      return NextResponse.json({
        success: false,
        error: { message: `${failed} file(s) failed to index` },
      }, { status: 500 });
    }

    // Indexing is complete when no files are in progress and at least one is completed
    const isComplete = in_progress === 0 && completed > 0;

    return NextResponse.json({
      success: true,
      data: {
        is_complete: isComplete,
        in_progress,
        completed,
        failed,
      },
    });
  } catch (error: any) {
    console.error('❌ Check indexing error:', error);
    return NextResponse.json({
      success: false,
      error: { message: error.message || 'Failed to check indexing status' },
    }, { status: 500 });
  }
}
