// scripts/ingestTradingZone.ts
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai"; // if you're using OpenAI for embeddings

// ---------- CONFIG ----------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const openaiApiKey = process.env.OPENAI_API_KEY!; // or use another provider

const TEXT_PATH = path.join(process.cwd(), "data/trading_in_the_zone_notes.txt");
// -----------------------------

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding as number[];
}

function splitIntoChunks(text: string, maxChars = 1000): string[] {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    const chunk = text.slice(i, i + maxChars);
    chunks.push(chunk.trim());
    i += maxChars;
  }

  return chunks.filter((c) => c.length > 0);
}

async function main() {
  console.log("Reading file:", TEXT_PATH);
  const raw = fs.readFileSync(TEXT_PATH, "utf8");

  const chunks = splitIntoChunks(raw, 1000);
  console.log("Total chunks:", chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    try {
      const embedding = await getEmbedding(content);

      const { error } = await supabase.from("trading_zone_chunks").insert({
        source: "trading_in_the_zone_notes",
        content,
        embedding,
      });

      if (error) {
        console.error("Insert error:", error.message);
        break;
      }
    } catch (err: any) {
      console.error("Error on chunk", i + 1, err.message);
      break;
    }
  }

  console.log("Done ingesting.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
