// src/app/api/chat/route.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      return new Response(
        JSON.stringify({ error: "Server is missing API key." }),
        { status: 500 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Request body must include messages array." }),
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "ft:gpt-4.1-nano-2025-04-14:kirk-williams:yoga-intentions-ai:Cl57h57Y",
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 128,
    });

    const content = completion.choices[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Chat route error:", err);

    return new Response(
      JSON.stringify({
        error: "Failed to generate completion",
        details: err?.message ?? String(err),
      }),
      { status: 500 }
    );
  }
}
