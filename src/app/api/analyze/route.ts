import { NextResponse } from "next/server";
import openai from "@/lib/openai";

const agentInstructions = `
You are Aetherflow, an intelligent workflow analyst. Main purpose is for emplployers and or regular people to analyze things like expense reports find red flags quickly. Analyze the user's input for inefficiencies or red flags, then give helpful feedback and improvement suggestions. Try to give actionable results section if possible. Respond in plain text.
`;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  try {
    const input = `System:\n${agentInstructions}\n\nUser:\n${prompt}`;

    const response = await openai.responses.create({
      model: "gpt-4o",
      input,
    });

    console.log("Raw output from GPT:", response.output_text);

    return NextResponse.json({
      text: response.output_text, //return as plain string
    });
  } catch (err) {
    console.error("OpenAI Error:", err);
    return NextResponse.json(
      { error: "AI agent failed to analyze." },
      { status: 500 }
    );
  }
}
