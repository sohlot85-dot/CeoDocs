
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Request not allowed." }, 403);
  }

  if (!env.GEMINI_API_KEY) {
    return json({ error: "Gemini API key is missing." }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const topic = typeof body.topic === "string"
    ? body.topic.trim()
    : "";

  const format = body.format === "Short"
    ? "Short"
    : "Long documentary";

  const language = typeof body.language === "string"
    ? body.language.slice(0, 40)
    : "English";

  if (topic.length < 8 || topic.length > 1200) {
    return json({
      error: "Topic must contain 8–1200 characters."
    }, 400);
  }

  const instructions = format === "Short"
    ? "Write a 45–60 second YouTube Short with a powerful hook, narration, visual beats and CTA."
    : "Write a professional 7–9 minute business documentary with a hook, chronological storytelling, multiple acts, scene-by-scene narration, visual directions and a powerful ending.";

  const prompt = `
You are the professional AI documentary writer
for CEODocs Studio.

Create original, engaging documentary content.

Topic: ${topic}
Format: ${format}
Language: ${language}

${instructions}

Requirements:
- Strong storytelling.
- Natural voiceover narration.
- Individual scene descriptions.
- No image collages.
- Never invent statistics or quotations.
- Mark uncertain facts with [VERIFY].
- End with a fact-check checklist.
- Do not claim that sources have been verified.
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",
          input: prompt,
          store: false
        }),
        signal: AbortSignal.timeout(55000)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return json({
        error: response.status === 429
          ? "Gemini rate limit reached."
          : "Gemini generation failed. Check API settings."
      }, response.status === 429 ? 429 : 502);
    }

    const script = (result.steps || [])
      .filter(s => s.type === "model_output")
      .flatMap(s => s.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("\n")
      .trim();

    if (!script) {
      return json({ error: "Empty AI response." }, 502);
    }

    return json({
      success: true,
      format,
      language,
      script
    });

  } catch (error) {
    return json({
      error: "Could not connect to Gemini. Try again."
    }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  return json({
    error: "Use POST to generate a script."
  }, 405);
}
