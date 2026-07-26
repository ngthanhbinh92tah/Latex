const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add lucide icon Settings
code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, (match, icons) => {
  if (!icons.includes('Settings')) {
    return `import { ${icons.trim()}, Settings } from 'lucide-react';`;
  }
  return match;
});

// 2. Add state for settings modal
code = code.replace(/export default function App\(\) \{/, 
`export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }
    setShowSettings(false);
  };
`);

// 3. Update fetch('/api/image-to-latex') headers
code = code.replace(
`      const response = await fetch('/api/image-to-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, ids, isEssay })
      });`,
`      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (savedKey) headers['x-api-key'] = savedKey;

      const response = await fetch('/api/image-to-latex', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64, ids, isEssay })
      });`
);

// 4. Update fetch('/api/doc-to-latex') headers
code = code.replace(
`      const response = await fetch('/api/doc-to-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileBase64: docBase64, 
          mimeType: docFileObj.type || (docFileObj.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
          startPage: docStartPage,
          endPage: docEndPage,
          ids,
          isEssay
        })
      });`,
`      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (savedKey) headers['x-api-key'] = savedKey;

      const response = await fetch('/api/doc-to-latex', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          fileBase64: docBase64, 
          mimeType: docFileObj.type || (docFileObj.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
          startPage: docStartPage,
          endPage: docEndPage,
          ids,
          isEssay
        })
      });`
);

// 5. Add Settings button in header
code = code.replace(
`            <h1 className="text-xl font-bold tracking-tight text-slate-800">
              LaTeX Duplicate Finder & ID Assigner
            </h1>
          </div>
        </div>
      </header>`,
`            <h1 className="text-xl font-bold tracking-tight text-slate-800">
              LaTeX Duplicate Finder & ID Assigner
            </h1>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Cài đặt API Key"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>`
);

// 6. Add Settings modal at the end of the file before last </div>
const modalCode = `
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5" /> Cài đặt API Key cá nhân
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Nhập API Key của bạn..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Key này sẽ được lưu tạm thời trên trình duyệt của bạn và gửi kèm trong các yêu cầu đến server để sử dụng thay cho Key mặc định của hệ thống.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveApiKey}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Lưu cài đặt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(/    <\/div>\n  \);\n\}\n$/, modalCode + '    </div>\n  );\n}\n');

fs.writeFileSync('src/App.tsx', code);
