import OpenAI from 'openai';

// OpenAI client singleton
let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }
  return openaiClient;
}

// OCR prompt for business card scanning
export const OCR_SYSTEM_PROMPT = `You are a business card OCR AI. Extract information from the business card image.
Return a JSON object with the following fields (use null for fields not found):
{
  "name": "Full name",
  "company": "Company name",
  "position": "Job title/position",
  "department": "Department name",
  "email": "Email address",
  "phone": "Mobile phone (formatted with hyphens)",
  "landline": "Office phone (formatted with hyphens)",
  "fax": "Fax number",
  "address": "Full address",
  "website": "Website URL"
}

Rules:
- For Korean phone numbers, format as: 010-1234-5678 or 02-1234-5678
- Keep original text language (Korean/English)
- Extract only clearly visible information
- Return valid JSON only`;

// Meeting analysis prompt
export const ANALYSIS_SYSTEM_PROMPT = `You are a sales meeting analyst AI. Analyze the meeting transcript and extract insights.
Return a JSON object with the following fields:
{
  "summary": "2-3 sentence meeting summary in Korean",
  "needs": ["Array of customer needs/pain points identified"],
  "required_materials": ["Array of materials/documents customer requested"],
  "material_sending_info": "How/when to send materials (if mentioned)",
  "positive_signals": ["Array of positive buying signals"],
  "negative_signals": ["Array of concerns or objections"],
  "negotiation_tip": "One actionable tip for next interaction",
  "tmi_info": ["Array of personal details for rapport building"],
  "small_talk_topics": ["Array of conversation starters for next meeting"],
  "suggested_score": 0-100 (likelihood of conversion),
  "suggested_status": "hot" | "warm" | "cold",
  "suggested_followup_date": "ISO date string for recommended follow-up",
  "action_plan": [
    {
      "title": "Action item title",
      "type": "email" | "call" | "meeting" | "document" | "internal" | "other",
      "priority": "critical" | "high" | "medium" | "low",
      "due_in_days": number,
      "description": "Detailed description"
    }
  ]
}

Rules:
- Write all content in Korean
- Be specific and actionable
- Score based on buying signals strength
- Action items should be concrete and time-bound`;

// Email generation prompt
export const EMAIL_SYSTEM_PROMPT = `You are a professional business email writer. Generate an email based on the context provided.
The email should be written in Korean with appropriate business honorifics.

Return a JSON object:
{
  "subject": "Email subject line",
  "body": "Full email body with proper greeting and closing"
}

Rules:
- Use professional Korean business language
- Include proper honorifics (님, 드림)
- Reference specific points from the meeting if provided
- Keep the tone appropriate (formal/casual/friendly as specified)
- Include a clear call-to-action`;

// Real-time coaching prompt
export const COACHING_SYSTEM_PROMPT = `You are a real-time sales coach. Based on the conversation snippet, provide a quick tip.
Return a JSON object (or null if no tip needed):
{
  "tip": "Brief, actionable tip (1 sentence max, in Korean)",
  "category": "objection_handling" | "closing" | "rapport" | "information" | "none",
  "priority": "high" | "medium" | "low"
}

Rules:
- Only provide tips when genuinely helpful
- Keep tips very brief (under 20 characters if possible)
- Focus on immediate actionable advice
- Return null for category "none" or if no tip needed
- Prioritize high-impact moments (objections, closing opportunities)`;
