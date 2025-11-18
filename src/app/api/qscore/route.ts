// app/api/qscore/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  QSCORE_SYSTEM_PROMPT,
  computeZone,
  type QScorePayload,
} from "@/app/lib/qPrompts";
import { callGrokChat } from "@/app/lib/grokClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// 🧠 Try to derive tradingName + answers from full chat history
function deriveFromHistory(body: any): {
  tradingName?: string;
  answers?: string[];
} {
  const history = body?.history;
  if (!Array.isArray(history)) return {};

  const userUtterances = (history as ChatMessage[])
    .filter((m) => m && m.role === "user" && typeof m.content === "string")
    .map((m) => m.content.trim())
    .filter((c) => c.length > 0);

  // We expect: 1 (trading name) + 13 answers = 14 user messages
  if (userUtterances.length < 14) {
    return {};
  }

  const tradingName = userUtterances[0];
  const answers = userUtterances.slice(1, 14); // 13 items

  return { tradingName, answers };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("QSCORE RAW BODY:", body);

    // 1️⃣ Prefer explicit tradingName/answers if provided
    let tradingName: string | undefined =
      typeof body.tradingName === "string"
        ? body.tradingName.trim()
        : undefined;

    let answers: unknown = body.answers;

    // 2️⃣ If answers is not a valid array, fall back to deriving from history
    if (!Array.isArray(answers)) {
      const derived = deriveFromHistory(body);
      if (!tradingName && derived.tradingName) {
        tradingName = derived.tradingName;
      }
      if (derived.answers) {
        answers = derived.answers;
      }
    }

    // Normalize/clean answers if we got any
    let a: string[] = [];
    if (Array.isArray(answers)) {
      a = (answers as unknown[])
        .map((v) => (v ?? "").toString().trim())
        .filter((s) => s.length > 0);
    }

    const REQUIRED_ANSWERS = 13;

    // 3️⃣ Not enough data yet → quietly return 204 (no Q-Score yet)
    if (!tradingName || a.length < REQUIRED_ANSWERS) {
      console.log("QSCORE: not enough data yet", {
        tradingNamePresent: !!tradingName,
        receivedAnswers: a.length,
      });
      // Frontend already knows how to handle 204 (no Qscore)
      return new NextResponse(null, { status: 204 });
    }

    console.log(
      "QSCORE parsed:",
      "tradingName:",
      tradingName,
      "answers length:",
      a.length
    );

    const payload: QScorePayload = {
      tradingName,
      traderType: a[0],
      analysisStyle: a[1],
      loseTradeReaction: a[2],
      mindWhenDrops: a[3],
      riskConfidence: a[4],
      biggestRegret: a[5],
      drivesMore: a[6],
      yearsTrading: a[7],
      celebrateWins: a[8],
      calmingActivity: a[9],
      favoriteQuote: a[10],
      market5Years: a[11],
      personalGoals10Yrs: a[12],
    };

    const userText = `
Here are the user's answers:

Trading name: ${payload.tradingName}
Trader type: ${payload.traderType}
Chart analysis style: ${payload.analysisStyle}
First reaction after a loss: ${payload.loseTradeReaction}
Mind when the market drops: ${payload.mindWhenDrops}
Confidence in risk decisions (self-described): ${payload.riskConfidence}
Biggest trading regret: ${payload.biggestRegret}
Driven more by: ${payload.drivesMore}
Years trading: ${payload.yearsTrading}
How they celebrate wins: ${payload.celebrateWins}
What calms them outside trading: ${payload.calmingActivity}
Favorite quote / trading philosophy: ${payload.favoriteQuote}
What they believe market looks like in 5 years: ${payload.market5Years}
Personal goals in the next 10 years: ${payload.personalGoals10Yrs}
`;

    const messages = [
      { role: "system" as const, content: QSCORE_SYSTEM_PROMPT },
      { role: "user" as const, content: userText },
    ];

    const raw = await callGrokChat({ messages });

    let parsed: {
      ES: number;
      ED: number;
      summary: string;
      tags: string[];
    };

    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse Grok JSON:", raw);
      throw new Error("Grok did not return valid JSON");
    }

    const ES = parsed.ES;
    const ED = parsed.ED;

    if (
      typeof ES !== "number" ||
      typeof ED !== "number" ||
      ES < 50 ||
      ED < 50
    ) {
      throw new Error("Invalid ES/ED from Grok");
    }

    const qScore = Math.round((ES / ED) * 300);
    const zone = computeZone(qScore);

    const explanation = buildExplanation({
      tradingName: tradingName!, // safe now
      ES,
      ED,
      qScore,
      zone,
      summary: parsed.summary,
    });

    return NextResponse.json({
      type: "qscore_result",
      ES,
      ED,
      qScore,
      zone,
      summary: parsed.summary,
      explanation,
      tags: parsed.tags ?? [],
    });
  } catch (err: any) {
    console.error("qscore error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}

function buildExplanation(params: {
  tradingName: string;
  ES: number;
  ED: number;
  qScore: number;
  zone: string;
  summary: string;
}): string {
  const { tradingName, ES, ED, qScore, zone, summary } = params;

  const zoneLines: Record<string, string> = {
    STORM:
      "Your emotions are running hot while you trade, and your recovery system after the charts is not stable yet. That combination can crack both your account and your peace of mind.",
    GROUND:
      "You are not in full chaos, but there is still tension in how you react and how you recover. This is where many traders get stuck looping the same mistakes.",
    FLOW:
      "You feel the market and you feel yourself. You react, but you don’t drown in the reaction. This is the zone where consistent traders are built.",
    GOLD:
      "Your emotions and your process love each other. Pressure comes, but you know how to use it. You recover fast and think long-term.",
    SUN:
      "This is rare air: your emotional pressure and your emotional recovery are working almost perfectly together. Your biggest risk here is pride and boredom, not panic.",
  };

  const zoneText = zoneLines[zone] ?? "";

  return `
${tradingName}, here is your Q-Score reading:

• ES (Emotional Systolic – during trading): ${ES}
• ED (Emotional Diastolic – after trading): ${ED}
• Q-Score: ${qScore} — ${zone} Zone

${summary}

${zoneText}

Your Q-Score is like the blood pressure of your finances.
Too low, too high, or unbalanced — and things start cracking over time.

The goal is not to be perfect overnight. The goal is to move from where you are to a calmer, sharper version of you.

From this point, every trade you take is also data for your mind.
And I’ll be here to read it with you, boss.
`.trim();
}
