import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
 
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});
 
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
 
  try {
    const { questions, ids } = req.body;
 
    if (!questions || !Array.isArray(questions) || !ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "Invalid input" });
    }
 
    if (ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }
 
    if (questions.length === 0) {
      return res.json({ matches: [] });
    }
 
    const prompt = `You are a math and physics teacher assistant. I have a list of LaTeX questions and a list of IDs (which may include descriptions).
Your task is to assign the most appropriate ID from the list to each question based on its content.
If an ID is already assigned in the question, or strongly implied by its content, match it.
 
Important Rules:
1. The available IDs may have descriptions next to them (e.g., "[6D1?1-1] Viết một tập hợp cho trước"). Use this description to understand the topic and find the best match for the question.
2. DIFFICULTY LEVEL SUBSTITUTION: Some IDs contain a '?' character (e.g., "[6D1?1-1]"). The '?' represents the difficulty level of the question. You MUST evaluate the question's difficulty and replace the '?' in the ID with ONE of the following letters:
   - 'B' (Nhận biết): Knowledge/Recall. Simple facts, definitions, direct identifications.
   - 'H' (Thông hiểu): Comprehension. Explaining concepts, simple one-step calculations, basic understanding.
   - 'V' (Vận dụng): Application. Applying formulas, solving standard multi-step problems.
   - 'C' (Vận dụng cao): Advanced Application. Complex problem solving, proofs, synthesis, challenging questions.
   For example, if a question matches the topic for "[6D1?1-1]" and is at the "Thông hiểu" level, your matchedId should be "[6D1H1-1]".
3. The 'matchedId' you return MUST ONLY be the final ID part itself, including the brackets if present (e.g., "[6D1H1-1]"). Do NOT include the description or the '?' in the 'matchedId' if you successfully replaced it.
 
IDs available:
${ids.join("\n")}
 
Questions:
${questions.map((q: any) => `Question ${q.id}: ${q.content}`).join("\n\n")}
 
Return a JSON array of matches, where each match has the question 'id' (number) and 'matchedId' (string, just the final substituted ID part).`;
 
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER, description: "The original question ID" },
              matchedId: { type: Type.STRING, description: "The selected ID from the available list" },
            },
            required: ["id", "matchedId"],
          },
        },
        temperature: 0.1,
      },
    });
 
    const jsonStr = response.text?.trim() || "[]";
    const matches = JSON.parse(jsonStr);
 
    res.json({ matches });
  } catch (error) {
    console.error("Error matching IDs:", error);
    res.status(500).json({ error: "Internal server error matching IDs" });
  }
}
 
