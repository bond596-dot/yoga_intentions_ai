import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const completion = await openai.chat.completions.create({
      // ⬇️ Put your fine-tuned model ID here
      model: "ft:gpt-4.1-nano-2025-04-14:YOUR-MODEL-ID",
      messages,
      stream: false,
    });

    return Response.json({
      content: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("Error in /api/chat route:", error);
    return new Response("Error generating completion", { status: 500 });
  }
}
