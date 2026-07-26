const fs = require('fs');
let code = fs.readFileSync('src/utils/latexParser.ts', 'utf8');
code = code.replace(
`      const response = await fetch('/api/match-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questionsToMatch, ids: idList })
      });`,
`      const apiKey = localStorage.getItem('GEMINI_API_KEY');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const response = await fetch('/api/match-ids', {
        method: 'POST',
        headers,
        body: JSON.stringify({ questions: questionsToMatch, ids: idList })
      });`
);
fs.writeFileSync('src/utils/latexParser.ts', code);
