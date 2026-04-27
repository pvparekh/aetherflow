import { NextResponse } from 'next/server';
import openai from '@/lib/openai';

const SYSTEM_PROMPT = `You are AetherFlow, an intelligent workflow and expense analyst.
Analyze the user's input (expense file, financial document, or business report) for red flags, inefficiencies, and actionable insights.

Respond with ONLY a valid JSON object — no markdown, no code fences:
{
  "sections": [
    {
      "type": "success|info|warning|critical",
      "title": "<short descriptive title>",
      "content": "<2-4 sentence analysis or finding>",
      "action": "<specific actionable recommendation>"
    }
  ]
}

Type guidelines:
- critical: immediate red flags requiring urgent attention
- warning: concerning patterns worth reviewing
- info: neutral observations and context
- success: positive findings or areas performing well

Generate 4-7 sections covering the most important findings. Be specific and actionable.`;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  try {
    const input = `System:\n${SYSTEM_PROMPT}\n\nUser:\n${prompt}`;
    const response = await openai.responses.create({
      model: 'gpt-4o',
      input,
      text: { format: { type: 'json_object' } },
    });

    let sections: { type: string; title: string; content: string; action?: string }[] = [];
    try {
      const parsed = JSON.parse(response.output_text);
      sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    } catch {
      sections = [{ type: 'info', title: 'Analysis', content: response.output_text }];
    }

    return NextResponse.json({ sections });
  } catch (err) {
    console.error('OpenAI Error:', err);
    return NextResponse.json({ error: 'AI agent failed to analyze.' }, { status: 500 });
  }
}
