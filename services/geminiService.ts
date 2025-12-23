
import { Achievement } from "../types.ts";

export const DEFAULT_AFFIRMATIONS = [
  "You are the lead in your own story.",
  "You deserve beautiful things.",
  "You always find a way to make it work.",
  "You are surrounded by love and support.",
  "You can overcome any challenge.",
  "You are stunning beyond words.",
  "Your charm is unforgettable.",
  "You are captivating in the best way.",
  "You radiate magnetic energy.",
  "You are destined for abundance.",
  "You are a magnet for opportunity.",
  "You attract prosperity with ease."
];

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const FALLBACK_API_KEY = "f46e1d0826984e90a695e389b79df8f4.r7JXgTivdaHiWdAb";

type ZhipuMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ZhipuCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class GeminiService {
  private apiKey: string | null;

  constructor() {
    const apiKey =
      import.meta.env?.VITE_ZHIPU_API_KEY ||
      import.meta.env?.ZHIPU_API_KEY ||
      import.meta.env?.VITE_GLM_API_KEY ||
      (typeof process !== "undefined"
        ? process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || process.env.API_KEY
        : undefined) ||
      FALLBACK_API_KEY;

    if (!apiKey) {
      this.apiKey = null;
      console.warn("Zhipu API key missing, falling back to local responses.");
      return;
    }

    this.apiKey = apiKey;
  }

  private async requestCompletion(messages: ZhipuMessage[], options?: { temperature?: number; maxTokens?: number }) {
    if (!this.apiKey) {
      throw new Error("Missing Zhipu API key.");
    }

    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-4.5-flash",
        messages,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zhipu API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ZhipuCompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }

  /**
   * Intelligently splits achievements from long sentences without punctuation.
   */
  async parseAchievements(rawText: string): Promise<string[]> {
    try {
      if (!this.apiKey) {
        return rawText
          .split(/[，。,.\n]/)
          .map(item => item.trim())
          .filter(item => item.length > 0)
          .map(item => this.normalizeAchievementText(item))
          .filter(item => item.length > 0);
      }
      const content = await this.requestCompletion(
        [
          {
            role: "system",
            content:
              "You are an achievement extraction expert. The user speaks casually like chatting with a friend. Extract multiple positive, actionable micro-achievements from the text. Keep each item short and outcome-focused. Output a JSON string array. Example input: \"I was tired but still went for a run and made a salad\" -> [\"Went for a run\",\"Made a healthy salad\"]. Do not output Markdown, only the JSON array itself.",
          },
          { role: "user", content: rawText },
        ],
        { temperature: 0.2, maxTokens: 256 },
      );

      const items = JSON.parse(content.trim());
      const normalized = Array.isArray(items) ? items : [rawText];
      return normalized
        .map((item) => this.normalizeAchievementText(String(item)))
        .filter((item) => item.length > 0);
    } catch (error) {
      console.warn("Zhipu parse failed, falling back:", error);
      return rawText
        .split(/[，。,.\n]/)
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => this.normalizeAchievementText(item))
        .filter(item => item.length > 0);
    }
  }

  /**
   * Generates a tailored, instant compliment.
   */
  async generatePraise(achievements: Achievement[], lastInput?: string): Promise<string> {
    const fallback = () =>
      DEFAULT_AFFIRMATIONS[Math.floor(Math.random() * DEFAULT_AFFIRMATIONS.length)];
    const context = lastInput || achievements.slice(-2).map(a => a.text).join(", ");
    
    try {
      if (!this.apiKey) {
        return fallback();
      }
      const content = await this.requestCompletion(
        [
          {
            role: "system",
            content:
              "You are a caring friend. Create a new compliment based on the user's input. Keep the tone natural, sincere, and specific. Avoid clichés or simply echoing the input. Do not use the structure \"You did X so well.\" The output must start with \"You\" and be 15-20 words. Output plain text only, without quotes.",
          },
          { role: "user", content: `Give a compliment based on: ${context}` },
        ],
        { temperature: 0.7, maxTokens: 64 },
      );

      let praiseText = content.trim().replace(/[“”、"']/g, "");
      if (!praiseText.startsWith('You')) praiseText = `You ${praiseText}`;
      if (/You did .+ so well/i.test(praiseText)) {
        return fallback();
      }
      return praiseText.length > 120 ? praiseText.slice(0, 120) : praiseText;
    } catch (error) {
      console.error("Zhipu praise generation error:", error);
      return fallback();
    }
  }

  private normalizeAchievementText(text: string): string {
    const trimmed = text.replace(/[。！？!?,，]+/g, "").trim();
    const cleaned = trimmed
      .replace(/^(I|Today|Just now|Just|Then|Afterwards|Later|Actually|A bit|Again|Also|Only|However|But|And|So)\s*/gi, "")
      .replace(/\s*(today|just now|just)\s*$/gi, "")
      .trim();
    return cleaned || trimmed;
  }
}

export const geminiService = new GeminiService();
