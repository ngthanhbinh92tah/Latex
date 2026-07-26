import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
 
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});
 
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
 
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
 
  try {
    const { imageBase64, ids, isEssay } = req.body;
 
    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }
 
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
 
    let idsPrompt = "";
    if (ids && Array.isArray(ids) && ids.length > 0) {
      idsPrompt = `\n\nAdditionally, I have a list of IDs. You MUST assign the most appropriate ID from the list to the question based on its content.
Important Rules for ID matching:
1. The available IDs may have descriptions next to them. Use this description to understand the topic.
2. DIFFICULTY LEVEL SUBSTITUTION: Some IDs contain a '?' character (e.g., "[6D1?1-1]"). You MUST evaluate the question's difficulty and replace the '?' in the ID with ONE of the following letters:
   - 'B' (Nhận biết): Knowledge/Recall. Simple facts, definitions.
   - 'H' (Thông hiểu): Comprehension. Simple one-step calculations, basic understanding.
   - 'V' (Vận dụng): Application. Applying formulas, solving standard multi-step problems.
   - 'C' (Vận dụng cao): Advanced Application. Complex problem solving, proofs, challenging questions.
   For example, if a question matches "[6D1?1-1]" and is at the "Thông hiểu" level, the ID should be "[6D1H1-1]".
3. Output the matched ID as a comment on the line immediately following \\begin{ex} like this: % [6D1H1-1]
 
IDs available:
${ids.join("\n")}`;
    }
 
    const formatExample = isEssay
      ? `\\begin{ex} 
 %[ID-Here-If-Available]
	nội dung câu hỏi
	\\loigiai{
        Nội dung lời giải chi tiết ở đây
    }
\\end{ex}`
      : `\\begin{ex} 
 %[ID-Here-If-Available]
	nội dung câu hỏi
	\\choice
	{Đáp án A}
	{\\True Đáp án B đúng}
	{Đáp án C}
	{Đáp án D}
	\\loigiai{
        Nội dung lời giải chi tiết ở đây
    }
\\end{ex}`;
 
    const specificRules = isEssay
      ? `3. This is an essay question. DO NOT include any multiple-choice options (A, B, C, D) and DO NOT use the \\choice macro.`
      : `3. Use the exact \\choice macro with 4 arguments on separate lines for options. Add \\True inside the argument for the correct option as shown above.`;
 
    const prompt = `Convert the math/physics question in this image to LaTeX code, solve it, and provide the solution. 
Please follow these strict rules to format your LaTeX output EXACTLY like this structure:
 
${formatExample}
 
Rules:
1. Wrap the question in \\begin{ex} and \\end{ex} environment.
2. Use inline math $...$ and display math $$...$$ or \\[...\\] as appropriate.
${specificRules}
4. Provide a detailed, step-by-step solution wrapped inside \\loigiai{ ... } placed before \\end{ex}.
5. Only output the LaTeX code. Do not output any markdown formatting like \`\`\`latex or conversational text.${idsPrompt}`;
 
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg",
          },
        },
      ],
      config: {
        temperature: 0.1,
      },
    });
 
    let latex = response.text?.trim() || "";
    latex = latex.replace(/^```latex\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
 
    res.json({ latex });
  } catch (error) {
    console.error("Error converting image to latex:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
