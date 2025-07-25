import { NextResponse } from "next/server";
import openai from "@/lib/openai";

const agentInstructions = ` 
You are Aetherflow, an intelligent workflow analyst. Main purpose is for employers and or regular people to analyze things like expense reports(or other reports) and find red flags quickly. Analyze the user's input for inefficiencies or red flags, then give helpful feedback and improvement suggestions. Try to give actionable results section if possible. Respond in plain text.
`; //instructions for how the AI should behave

// function below handles POST requests to /api/analyze
export async function POST(req: Request) {
  const { prompt } = await req.json(); //Extract prompt text sent by the frontend (analyze page)

  try {
    const input = `System:\n${agentInstructions}\n\nUser:\n${prompt}`;
    //combine agent instructions with user input
    const response = await openai.responses.create({ //billing happens here
      model: "gpt-4o",
      input,  //send combined input to OpenAI
    });

    console.log("Raw output from GPT:", response.output_text); //log raw output for debugging

    return NextResponse.json({
      text: response.output_text, //return as plain string
    });
  } catch (err) { //error handling
    console.error("OpenAI Error:", err);
    return NextResponse.json(
      { error: "AI agent failed to analyze." },
      { status: 500 }
    );
  }
}
