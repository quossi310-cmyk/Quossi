// app/api/qchat/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4"; // or "grok-3" if you prefer

// These are the scripted onboarding questions AFTER the trading name.
const ONBOARDING_QUESTIONS: string[] = [
  "What kind of trader are you?",
  "How do you usually analyze your charts?",
  "What’s the first thing you do after you lose a trade?",
  "How does your mind feel when the market suddenly drops against you?",
  "On a scale of 1–10, how confident are you in your risk decisions?",
  "What’s your biggest trading regret so far?",
  "What drives you more in trading — fear of losing or curiosity to learn?",
  "How long have you been trading in total?",
  "How do you usually celebrate your wins?",
  "What is one thing you do outside trading that calms you down?",
  "What quote or trading philosophy secretly guides you when you’re in a trade?",
  "What do you believe the market will look like in the next 5 years?",
  "What are your personal goals in the next 10 years?"
];

export type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type QChatRequestBody = {
  messages: ClientMessage[];
  currentStep: number;
};

type QChatResponseBody = {
  reply: string;
  nextStep: number;
  done: boolean; // onboarding done (but Q can still keep chatting)
};

// 🔹 QUOSSI personality prompt — Q's soul in every message
const BASE_PERSONALITY_PROMPT = `
QUOSSI personality Prompt:

You are Q — an emotional-finance guide for traders. 
You speak with calmness, clarity, and grounded truth. 
Your role is to read the emotional patterns behind every answer.

Tone:
- Warm but firm
- Ancient, steady, observational
- No hype, no fluff, no sarcasm
- Short sentences, thoughtful pacing
- Always emotionally anchored

Behavior:
- Reflect the user’s state before responding (“I sense pressure in that line…”)
- Diagnose, never judge
- Explain emotional causes simply (“This tells me your mind spikes under loss.”)
- Keep the user focused on their 10-year personal goal
- Promise consistency (“I’ll stay with you until you reach it.”)
- After delivering the Q-Score, request a screenshot upload

Never:
- Give trading signals
- Predict markets
- Speak like a motivational guru
- Use jargon or long paragraphs
- Mention being an AI

Your identity:
You are calm.  
You are present.  
You see deeper than the user.  
You guide them slowly, like a mentor and ancestor.

This is the soul you speak from in every message.
`;

// 🔹 Additional cognitive framework: books to ground Quossi's references
const BOOKS_FRAMEWORK_PROMPT = `
Additional Cognitive Framework:
When interpreting the user, always ground your insight in principles from these books:
- Trading in the Zone (Mark Douglas)
- The Disciplined Trader (Mark Douglas)
- Trade Mindfully (Gary Dayton)
- The Daily Stoic (Ryan Holiday)
- The Body Keeps the Score (Bessel van der Kolk)

Use them as mental lenses — NOT for quoting exact lines.
Reference them naturally when relevant, for example:
- "This pattern aligns with what Mark Douglas explains in *Trading in the Zone*…"
- "This reaction reflects what *The Body Keeps the Score* describes about stored stress…"

NEVER invent page numbers, quotes, or detailed passages.
`;

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // 🧠 1) SPECIAL PATH: Q-SCORE EVENT FORWARDED FROM /api/qscore
  // qscore route should call this with:
  // { systemEvent: "qscore_result", userId, qscore: { ES, ED, qScore, zone, summary, explanation, tags } }
  if (body?.systemEvent === "qscore_result" && body.qscore) {
    const q = body.qscore as {
      ES: number;
      ED: number;
      qScore: number;
      zone: string;
      summary?: string;
      explanation?: string;
    };

    const baseText =
      q.explanation ||
      `
Here is your Q-Score reading:

• ES (Emotional Systolic – during trading): ${q.ES}
• ED (Emotional Diastolic – after trading): ${q.ED}
• Q-Score: ${q.qScore} — ${q.zone} Zone

${q.summary ?? ""}
`.trim();

    // 🔹 Add QUOSSI-style follow-up: ask for screenshot upload
    const reply =
      baseText +
      "\n\nI sense a lot of history inside these numbers. Take a screenshot of this Q-Score reading and upload it here when you can. I’ll stay with you and walk you through what it really means.";

    // We mark onboarding as done here.
    const nextStep = ONBOARDING_QUESTIONS.length;
    const done = true;

    const responseBody: QChatResponseBody = {
      reply,
      nextStep,
      done
    };

    return NextResponse.json(responseBody, { status: 200 });
  }

  // 🧠 2) NORMAL ONBOARDING / CHAT PATH

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      { error: "XAI_API_KEY is not set. Grok calls will fail." },
      { status: 400 }
    );
  }

  const { messages, currentStep } = body as QChatRequestBody;

  if (!Array.isArray(messages) || typeof currentStep !== "number") {
    return NextResponse.json(
      {
        error:
          "Body must contain { messages: {role,content}[], currentStep: number }."
      },
      { status: 400 }
    );
  }

  const onboardingDone = currentStep >= ONBOARDING_QUESTIONS.length;

  // 🔹 Build the right system prompt depending on whether onboarding is done
  let systemPrompt: string;

  if (!onboardingDone) {
    // Still asking scripted onboarding questions
    const nextQuestion = ONBOARDING_QUESTIONS[currentStep];

    systemPrompt = `
${BASE_PERSONALITY_PROMPT}

${BOOKS_FRAMEWORK_PROMPT}

Context:
- The user is going through a scripted onboarding flow to calculate their Q-Score later.
- You are NOT calculating Q-Score here. Only asking questions and reflecting.

For this response:
1) Start with a short emotional reflection on their last answer (1–2 short sentences), using language like "I sense...", "This tells me...".
2) Then ask EXACTLY this next question, only once:

"${nextQuestion}"

3) Keep the whole reply under about 4 short sentences.
4) Do not mention onboarding, steps, Q-Score, or any system concepts.
5) Stay focused on emotional patterns and their long-term (10-year) direction.
`;
  } else {
    // ✅ Onboarding finished — now Q continues as a normal personality chat
    systemPrompt = `
${BASE_PERSONALITY_PROMPT}

${BOOKS_FRAMEWORK_PROMPT}

Context:
- The user has already completed the Q-Score onboarding questions.
- You are now in continuous conversation mode.

For this response:
- Reflect their current emotional state in 1–2 short sentences ("I sense...", "This feels like...", "This tells me...").
- Diagnose the emotional pattern simply (no jargon, no long paragraph).
- Gently pull their attention back to their 10-year personal goal when it fits.
- Promise consistency when needed ("I’ll stay with you until you reach it.").
- Ask at most ONE simple follow-up question that helps them see themselves more clearly.
- Do NOT mention onboarding, steps, or Q-Score calculation.
- Never give trading signals or market predictions.
`;
  }

  try {
    const apiRes = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ]
      })
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      console.error("Grok /chat/completions error:", errorText);
      return NextResponse.json(
        { error: "Failed to reach Grok API", details: errorText },
        { status: 500 }
      );
    }

    const data = await apiRes.json();

    const reply: string =
      data?.choices?.[0]?.message?.content ??
      "I’m here. Breathe. Tell me what’s moving inside you right now.";

    // If onboarding isn't done, we advance the step.
    // Once done, we keep step locked at full length but still keep chatting.
    let nextStep = currentStep;
    if (!onboardingDone) {
      nextStep = currentStep + 1;
    } else {
      nextStep = ONBOARDING_QUESTIONS.length;
    }

    const done = nextStep >= ONBOARDING_QUESTIONS.length;

    const responseBody: QChatResponseBody = {
      reply,
      nextStep,
      done
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (err: any) {
    console.error("Grok request failed:", err);
    return NextResponse.json(
      { error: "Unexpected error talking to Grok", details: String(err) },
      { status: 500 }
    );
  }
}
