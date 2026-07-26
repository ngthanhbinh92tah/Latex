const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const docEndpoint = `
  app.post("/api/doc-to-latex", async (req, res) => {
    try {
      const { fileBase64, mimeType, startPage, endPage, ids, isEssay } = req.body;

      if (!fileBase64) {
        return res.status(400).json({ error: "No file provided" });
      }

      const base64Data = fileBase64.replace(/^data:.*?;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      let finalMimeType = mimeType;
      let finalData = base64Data;
      let textContent = null;

      if (mimeType === 'application/pdf') {
        if (startPage || endPage) {
          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.load(buffer);
          const totalPages = pdfDoc.getPageCount();
          
          const start = startPage ? Math.max(1, parseInt(startPage)) : 1;
          const end = endPage ? Math.min(totalPages, parseInt(endPage)) : totalPages;
          
          if (start <= end) {
            const newPdf = await PDFDocument.create();
            const pageIndices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
            const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach((page) => newPdf.addPage(page));
            
            const newPdfBytes = await newPdf.save();
            finalData = Buffer.from(newPdfBytes).toString('base64');
          }
        }
      } else if (mimeType.includes('word') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        textContent = result.value;
      }

      let idsPrompt = "";
      if (ids && Array.isArray(ids) && ids.length > 0) {
        idsPrompt = \`\\n\\nAdditionally, I have a list of IDs. You MUST assign the most appropriate ID from the list to the question based on its content.
Important Rules for ID matching:
1. The available IDs may have descriptions next to them. Use this description to understand the topic.
2. DIFFICULTY LEVEL SUBSTITUTION: Some IDs contain a '?' character (e.g., "[6D1?1-1]"). You MUST evaluate the question's difficulty and replace the '?' in the ID with ONE of the following letters:
   - 'B' (Nhận biết): Knowledge/Recall. Simple facts, definitions.
   - 'H' (Thông hiểu): Comprehension. Simple one-step calculations, basic understanding.
   - 'V' (Vận dụng): Application. Applying formulas, solving standard multi-step problems.
   - 'C' (Vận dụng cao): Advanced Application. Complex problem solving, proofs, challenging questions.
   For example, if a question matches "[6D1?1-1]" and is at the "Thông hiểu" level, the ID should be "[6D1H1-1]".
3. Output the matched ID as a comment on the line immediately following \\\\begin{ex} like this: % [6D1H1-1]

IDs available:
\${ids.join('\\n')}\`;
      }

      const formatExample = isEssay 
        ? \`\\\\begin{ex} 
 %[ID-Here-If-Available]
	nội dung câu hỏi
	\\\\loigiai{
        Nội dung lời giải chi tiết ở đây
    }
\\\\end{ex}\` 
        : \`\\\\begin{ex} 
 %[ID-Here-If-Available]
	nội dung câu hỏi
	\\\\choice
	{Đáp án A}
	{\\\\True Đáp án B đúng}
	{Đáp án C}
	{Đáp án D}
	\\\\loigiai{
        Nội dung lời giải chi tiết ở đây
    }
\\\\end{ex}\`;

      const specificRules = isEssay
        ? \`3. This is an essay question. DO NOT include any multiple-choice options (A, B, C, D) and DO NOT use the \\\\choice macro.\`
        : \`3. Use the exact \\\\choice macro with 4 arguments on separate lines for options. Add \\\\True inside the argument for the correct option as shown above.\`;

      const prompt = \`Extract all math/physics questions from this document, convert them to LaTeX code, solve them, and provide the solution for each. 
Please follow these strict rules to format your LaTeX output EXACTLY like this structure:

\${formatExample}

Rules:
1. Wrap each question in \\\\begin{ex} and \\\\end{ex} environment.
2. Use inline math $...$ and display math $$...$$ or \\\\[...\\\\] as appropriate.
\${specificRules}
4. Provide a detailed, step-by-step solution wrapped inside \\\\loigiai{ ... } placed before \\\\end{ex}.
5. Only output the LaTeX code. Do not output any markdown formatting like \\\`\\\`\\\`latex or conversational text.\${idsPrompt}\`;

      const parts = [prompt];
      if (textContent) {
        parts.push({ text: textContent });
      } else {
        parts.push({
          inlineData: {
            data: finalData,
            mimeType: finalMimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: parts,
        config: {
          temperature: 0.1
        }
      });

      let latex = response.text?.trim() || "";
      // Strip markdown code blocks if the model still adds them
      latex = latex.replace(/^\\\`\\\`\\\`latex\\n?/, "").replace(/^\\\`\\\`\\\`\\n?/, "").replace(/\\n?\\\`\\\`\\\`$/, "");

      res.json({ latex });
    } catch (error) {
      console.error("Error converting document to latex:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
`;

code = code.replace(/if \(process.env.NODE_ENV !== "production"\)/, docEndpoint + "\n  if (process.env.NODE_ENV !== \"production\")");

fs.writeFileSync('server.ts', code);
