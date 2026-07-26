const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace the global ai instance with a getter function
code = code.replace(
`const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});`,
`function getAiClient(req: express.Request) {
  const userApiKey = req.headers['x-api-key'] as string;
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API Key. Please provide one in settings.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}`
);

// Replace ai.models with getAiClient(req).models
code = code.replace(/ai\.models\.generateContent/g, "getAiClient(req).models.generateContent");

fs.writeFileSync('server.ts', code);
