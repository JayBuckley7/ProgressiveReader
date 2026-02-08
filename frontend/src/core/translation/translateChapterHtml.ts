import type { LlmChatPort } from "@core/llm/ports";
import { stripMarkdownCodeFences } from "@core/utils/markdown";

export async function translateChapterHtmlWithLlm(args: {
  llm: LlmChatPort;
  apiKey: string;
  html: string;
  targetLanguage: string;
  model: string;
  useCefr: boolean;
  cefrLevel?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const targetLang = (args.targetLanguage || "English").trim() || "English";
  const model = (args.model || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const cefrLevel = (args.cefrLevel || "").trim();

  let systemPrompt =
    "You are a professional translator specializing in literary content. " +
    "Translate the provided chapter HTML into the target language. Preserve all HTML formatting, including headings, paragraphs, and emphasis. " +
    "Do not add explanations or extra text beyond the translation.";
  if (args.useCefr && cefrLevel) {
    systemPrompt += ` Aim for a CEFR level of ${cefrLevel}. Simplify complex expressions while keeping the meaning.`;
  }

  const userPrompt = `Translate this chapter into ${targetLang}. Return only HTML without backticks.`;
  const fullUserPrompt = `${userPrompt}\n\nHTML Content:\n\`\`\`html\n${args.html}\n\`\`\``;

  const completion = await args.llm.createChatCompletion({
    apiKey: args.apiKey,
    body: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: fullUserPrompt },
      ],
      temperature: 0.3,
    },
    signal: args.signal,
  });

  return stripMarkdownCodeFences(completion.content);
}

