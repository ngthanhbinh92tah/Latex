import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Download, AlertTriangle, CheckCircle, Search, FileUp, Info, Trash2, ShieldCheck, SlidersHorizontal, Eye, Link, Layers, PlusCircle, Image as ImageIcon, Copy, Filter, Settings } from 'lucide-react';
import { parseLatex, ParseResult, assignIds, AssignIdResult, filterQuestionsByIds, FilterResult } from './latexParser';
import { DEFAULT_ID_LIST } from './defaultIds';

export default function App() {
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

  const [activeTab, setActiveTab] = useState<'dedupe' | 'assign-id' | 'image-to-latex' | 'filter-by-id' | 'doc-to-latex'>('dedupe');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [envs, setEnvs] = useState('ex, cau, question, bt, bai, vd');
  
  // Dedupe state
  const [similarityThreshold, setSimilarityThreshold] = useState(95);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [deletedChunkIds, setDeletedChunkIds] = useState<Set<number>>(new Set());
  const [activeTabByGroup, setActiveTabByGroup] = useState<Record<number, number>>({});
  
  // Assign ID state
  const [idListText, setIdListText] = useState('');
  const [useDefaultIds, setUseDefaultIds] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignIdResult | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Image to LaTeX state
  const [imageBase64, setImageBase64] = useState<string>('');
  const [generatedLatex, setGeneratedLatex] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEssay, setIsEssay] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Document to LaTeX state
  const [docBase64, setDocBase64] = useState<string>('');
  const [docFileObj, setDocFileObj] = useState<File | null>(null);
  const [docStartPage, setDocStartPage] = useState<string>('');
  const [docEndPage, setDocEndPage] = useState<string>('');
  const [docGeneratedLatex, setDocGeneratedLatex] = useState<string>('');
  const [isDocGenerating, setIsDocGenerating] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Filter by ID state
  const [filterFiles, setFilterFiles] = useState<File[]>([]);
  const [filterFilesContent, setFilterFilesContent] = useState<{name: string, content: string}[]>([]);
  const [filterIdList, setFilterIdList] = useState<string>('');
  const [filterResult, setFilterResult] = useState<FilterResult | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const filterFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useDefaultIds) {
      setIdListText(DEFAULT_ID_LIST);
    }
  }, [useDefaultIds]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const idFileInputRef = useRef<HTMLInputElement>(null);

  const handleIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      let extracted: string[] = [];
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('%')) {
          const comment = line.substring(line.indexOf('%'));
          const match = comment.match(/\[([a-zA-Z0-9_.-]+)\]/);
          if (match) {
            extracted.push(`[${match[1]}]`);
          } else {
            const matchNoBracket = comment.match(/%\s*([0-9][a-zA-Z0-9_.-]+)/);
            if (matchNoBracket) {
               extracted.push(`[${matchNoBracket[1]}]`);
            }
          }
        }
      }
      if (f.name.endsWith('.tex') && extracted.length > 0) {
        setIdListText(Array.from(new Set(extracted)).join('\n'));
      } else {
        setIdListText(text.trim());
      }
      if (idFileInputRef.current) idFileInputRef.current.value = '';
    };
    reader.readAsText(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null); // Reset result when new file is selected
    setAssignResult(null);
    setDeletedChunkIds(new Set());

    const reader = new FileReader();
    reader.onload = (evt) => {
      setFileContent(evt.target?.result as string);
    };
    reader.readAsText(f);
  };

  const handleAnalyze = () => {
    if (!fileContent) return;
    
    setIsAnalyzing(true);
    // Simulate slight delay for UX feeling of processing
    setTimeout(() => {
      const parsedResult = parseLatex(fileContent, envs, similarityThreshold / 100);
      setResult(parsedResult);
      
      const initialDeleted = new Set<number>();
      parsedResult.chunks.forEach(c => {
        if (c.isDuplicate) initialDeleted.add(c.id);
      });
      setDeletedChunkIds(initialDeleted);
      
      setIsAnalyzing(false);
    }, 300);
  };

  const handleAssignIds = async () => {
    if (!fileContent) return;
    setIsAssigning(true);
    try {
      const res = await assignIds(fileContent, envs, idListText);
      setAssignResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDownloadDedupe = () => {
    if (!result) return;
    const filteredContent = result.chunks
      .filter(c => !deletedChunkIds.has(c.id))
      .map(c => c.content)
      .join('');
    downloadFile(filteredContent, file ? file.name.replace('.tex', '_filtered.tex') : 'filtered.tex');
  };

  const handleDownloadAssign = () => {
    if (!assignResult) return;
    downloadFile(assignResult.updatedContent, file ? file.name.replace('.tex', '_id.tex') : 'with_ids.tex');
  };

  const handleFilterFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []) as File[];
    if (newFiles.length === 0) return;
    
    const updatedFiles = [...filterFiles, ...newFiles];
    setFilterFiles(updatedFiles);
    setFilterResult(null);
    
    const readNewFiles = await Promise.all(newFiles.map(async (f: File) => {
      const text = await f.text();
      return { name: f.name, content: text };
    }));
    
    setFilterFilesContent([...filterFilesContent, ...readNewFiles]);
    
    if (filterFileInputRef.current) {
      filterFileInputRef.current.value = ''; // Reset input so same file can be selected again
    }
  };

  const handleRemoveFilterFile = (index: number) => {
    const newFiles = [...filterFiles];
    newFiles.splice(index, 1);
    setFilterFiles(newFiles);
    
    const newFilesContent = [...filterFilesContent];
    newFilesContent.splice(index, 1);
    setFilterFilesContent(newFilesContent);
    
    setFilterResult(null);
  };

  const handleFilter = () => {
    if (filterFilesContent.length === 0 || !filterIdList) return;
    setIsFiltering(true);
    
    setTimeout(() => {
      const result = filterQuestionsByIds(filterFilesContent, envs, filterIdList);
      setFilterResult(result);
      setIsFiltering(false);
    }, 100);
  };

  const handleDownloadFilter = () => {
    if (!filterResult) return;
    downloadFile(filterResult.content, 'filtered_questions.tex');
  };

  const handlePreviewPdf = (content: string) => {
    let finalLatex = content;
    if (!content.includes('\\documentclass')) {
      finalLatex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage[margin=1in]{geometry}
\\newenvironment{ex}{\\par\\vspace{10pt}\\noindent\\textbf{Câu hỏi: }}{\\par}
\\newcommand{\\choice}[4]{\\begin{itemize} \\item A. #1 \\item B. #2 \\item C. #3 \\item D. #4 \\end{itemize}}
\\newcommand{\\True}{\\textbf{[ĐÚNG]} }
\\newcommand{\\loigiai}[1]{\\par\\noindent\\textbf{Lời giải:} #1}
\\begin{document}
${content}
\\end{document}`;
    }
    const url = `https://latexonline.cc/compile?text=${encodeURIComponent(finalLatex)}`;
    window.open(url, '_blank');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    processImageFile(f);
  };

  const processImageFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageBase64(evt.target?.result as string);
      setGeneratedLatex('');
    };
    reader.readAsDataURL(f);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeTab !== 'image-to-latex') return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            processImageFile(blob);
          }
          break;
        }
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [activeTab]);

  const generateLatexFromImage = async () => {
    if (!imageBase64) return;
    setIsGenerating(true);
    setGeneratedLatex('');
    try {
      const ids = DEFAULT_ID_LIST.split('\n').map(id => id.trim()).filter(id => id.length > 0);
      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (savedKey) headers['x-api-key'] = savedKey;

      const response = await fetch('/api/image-to-latex', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64, ids, isEssay })
      });
      const data = await response.json();
      if (data.latex) {
        setGeneratedLatex(data.latex);
      } else {
        setGeneratedLatex('% Error: could not generate latex or no latex returned');
      }
    } catch (e) {
      console.error(e);
      setGeneratedLatex('% Error connecting to server');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setDocFileObj(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        setDocBase64(event.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const generateLatexFromDoc = async () => {
    if (!docBase64 || !docFileObj) return;
    setIsDocGenerating(true);
    setDocGeneratedLatex('');
    try {
      const ids = DEFAULT_ID_LIST.split('\n').map(id => id.trim()).filter(id => id.length > 0);
      const savedKey = localStorage.getItem('GEMINI_API_KEY');
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
      });
      const data = await response.json();
      if (data.latex) {
        setDocGeneratedLatex(data.latex);
      } else {
        setDocGeneratedLatex('% Error: could not generate latex or no latex returned\n' + (data.error || ''));
      }
    } catch (e) {
      console.error(e);
      setDocGeneratedLatex('% Error connecting to server');
    } finally {
      setIsDocGenerating(false);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Search className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">
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
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('dedupe')}
            className={`pb-3 px-4 font-medium text-sm transition-colors relative ${activeTab === 'dedupe' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Lọc trùng lặp
            </div>
            {activeTab === 'dedupe' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('assign-id')}
            className={`pb-3 px-4 font-medium text-sm transition-colors relative ${activeTab === 'assign-id' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4" />
              Gắn ID tự động
            </div>
            {activeTab === 'assign-id' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('image-to-latex')}
            className={`pb-3 px-4 font-medium text-sm transition-colors relative ${activeTab === 'image-to-latex' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Ảnh sang LaTeX
            </div>
            {activeTab === 'image-to-latex' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('filter-by-id')}
            className={`pb-3 px-4 font-medium text-sm transition-colors relative ${activeTab === 'filter-by-id' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Lọc theo ID
            </div>
            {activeTab === 'filter-by-id' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('doc-to-latex')}
            className={`pb-3 px-4 font-medium text-sm transition-colors relative ${activeTab === 'doc-to-latex' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Tài liệu sang LaTeX
            </div>
            {activeTab === 'doc-to-latex' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
        </div>

        {/* Section 1: Configuration & Upload */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              1. Cấu hình & Chọn File
            </h2>
          </div>
          
          <div className="p-6 grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {activeTab !== 'image-to-latex' && activeTab !== 'filter-by-id' && activeTab !== 'doc-to-latex' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Các môi trường câu hỏi (cách nhau bởi dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={envs}
                    onChange={(e) => setEnvs(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="ex, cau, question..."
                  />
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    VD: Nếu câu hỏi nằm trong \begin&#123;ex&#125;...\end&#123;ex&#125;, hãy điền 'ex'
                  </p>
                </div>
              )}

              {activeTab === 'dedupe' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                    <span>Mức độ giống nhau: {similarityThreshold}%</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" />
                    Giảm % để phát hiện các câu gần giống nhau (đổi chữ, thêm bớt nhỏ).
                  </p>
                </div>
              )}

              {activeTab === 'assign-id' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">
                      Danh sách ID để đối chiếu và nhận dạng (mỗi ID 1 dòng)
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={useDefaultIds}
                          onChange={(e) => setUseDefaultIds(e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                        />
                        <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 select-none">
                          Sử dụng danh sách mặc định
                        </span>
                      </label>
                      <button
                        onClick={() => idFileInputRef.current?.click()}
                        className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Upload className="w-3 h-3" />
                        Tải file (.txt, .tex)
                      </button>
                    </div>
                    <input 
                      type="file" 
                      ref={idFileInputRef} 
                      onChange={handleIdFileChange} 
                      accept=".tex,.txt"
                      className="hidden"
                    />
                  </div>
                  <textarea
                    value={idListText}
                    onChange={(e) => {
                      setIdListText(e.target.value);
                      if (useDefaultIds) setUseDefaultIds(false);
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all h-32 font-mono text-sm resize-none"
                    placeholder="[6D1?1-1] Viết một tập hợp cho trước&#10;[6D1?1-2] Quan hệ giữa phần tử và tập hợp&#10;[6D1?1-3] Biểu đồ Ven"
                  />
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>AI sẽ tự động đọc câu hỏi và chọn ID phù hợp nhất. Nếu ID có dấu '?', AI sẽ tự động đánh giá và thay bằng mức độ: <strong>B</strong> (Nhận biết), <strong>H</strong> (Thông hiểu), <strong>V</strong> (Vận dụng), <strong>C</strong> (Vận dụng cao).</span>
                  </p>
                </div>
              )}

              {activeTab === 'filter-by-id' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Danh sách ID cần lọc (mỗi ID một dòng)
                  </label>
                  <textarea
                    value={filterIdList}
                    onChange={(e) => setFilterIdList(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all h-32 resize-none font-mono text-sm"
                    placeholder="[6D1H1-1]&#10;[6D2V1-3]&#10;[7H1B2-1]..."
                  />
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>Hệ thống sẽ lọc câu hỏi theo ID. Có thể chỉ định số lượng cần lấy sau ID (ví dụ: <b>[6D1H1-1] 5</b>). Dùng <b>?</b> hoặc <b>*</b> nếu thiếu dữ kiện (ví dụ: <b>[6D1?1-*] 2</b>).</span>
                  </p>
                </div>
              )}

              {activeTab === 'image-to-latex' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                    <span>Tải lên hoặc dán ảnh (Ctrl+V)</span>
                    {imageBase64 && (
                      <button
                        onClick={() => { setImageBase64(''); setGeneratedLatex(''); }}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Xóa ảnh
                      </button>
                    )}
                  </label>
                  <div 
                    onClick={() => !imageBase64 && imageInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors relative overflow-hidden ${
                      imageBase64 ? 'border-blue-300 bg-slate-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 cursor-pointer'
                    }`}
                    style={{ minHeight: '160px' }}
                  >
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      onChange={handleImageChange} 
                      accept="image/*"
                      className="hidden"
                    />
                    {imageBase64 ? (
                      <div className="flex flex-col items-center justify-center w-full h-full max-h-48">
                        <img src={imageBase64} alt="Uploaded" className="max-h-48 object-contain rounded" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-500 h-full justify-center mt-4">
                        <ImageIcon className="w-8 h-8 mb-2 text-slate-400" />
                        <span>Nhấn để chọn ảnh hoặc dán (Ctrl+V)</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'doc-to-latex' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tải lên file PDF hoặc Word
                    </label>
                    <div 
                      onClick={() => docInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors relative overflow-hidden ${
                        docFileObj ? 'border-blue-300 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={docInputRef} 
                        onChange={handleDocChange} 
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                      />
                      {docFileObj ? (
                        <div className="flex flex-col items-center">
                          <FileText className="w-8 h-8 text-blue-500 mb-2" />
                          <span className="font-medium text-blue-700">{docFileObj.name}</span>
                          <span className="text-xs text-blue-500 mt-1">
                            {(docFileObj.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-slate-500">
                          <FileUp className="w-8 h-8 mb-2 text-slate-400" />
                          <span>Nhấn để chọn file PDF hoặc Word</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {docFileObj && docFileObj.type === 'application/pdf' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Từ trang</label>
                        <input 
                          type="number" 
                          min="1"
                          value={docStartPage}
                          onChange={(e) => setDocStartPage(e.target.value)}
                          placeholder="Ví dụ: 1"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Đến trang</label>
                        <input 
                          type="number" 
                          min="1"
                          value={docEndPage}
                          onChange={(e) => setDocEndPage(e.target.value)}
                          placeholder="Ví dụ: 5"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="docEssayCheck"
                      checked={isEssay}
                      onChange={(e) => setIsEssay(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="docEssayCheck" className="text-sm text-slate-700 font-medium cursor-pointer">
                      Câu hỏi tự luận (không thêm A, B, C, D)
                    </label>
                  </div>
                </div>
              ) : activeTab === 'filter-by-id' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tải lên các file LaTeX (.tex)
                  </label>
                  <div 
                    onClick={() => filterFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      filterFiles.length > 0 ? 'border-blue-300 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={filterFileInputRef} 
                      onChange={handleFilterFilesChange} 
                      accept=".tex,.txt"
                      multiple
                      className="hidden"
                    />
                    {filterFiles.length > 0 ? (
                      <div className="flex flex-col items-center">
                        <Layers className="w-8 h-8 text-blue-500 mb-2" />
                        <span className="font-medium text-blue-700">Đã chọn {filterFiles.length} file</span>
                        <span className="text-xs text-blue-500 mt-1">
                          Tổng {(filterFiles.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-500">
                        <FileUp className="w-8 h-8 mb-2 text-slate-400" />
                        <span>Nhấn để chọn nhiều file LaTeX</span>
                      </div>
                    )}
                  </div>
                  
                  {filterFiles.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                      {filterFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2 text-sm">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate text-slate-700 font-medium" title={f.name}>{f.name}</span>
                            <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <button
                            onClick={() => handleRemoveFilterFile(idx)}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0"
                            title="Xóa file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tải lên file LaTeX (.tex)
                  </label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      file ? 'border-blue-300 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".tex,.txt"
                      className="hidden"
                    />
                    {file ? (
                      <div className="flex flex-col items-center">
                        <FileText className="w-8 h-8 text-blue-500 mb-2" />
                        <span className="font-medium text-blue-700">{file.name}</span>
                        <span className="text-xs text-blue-500 mt-1">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-500">
                        <FileUp className="w-8 h-8 mb-2 text-slate-400" />
                        <span>Nhấn để chọn file LaTeX</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-end">
              {activeTab === 'dedupe' && (
                <button
                  onClick={handleAnalyze}
                  disabled={!file || isAnalyzing || !fileContent}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang phân tích...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Bắt đầu phân tích
                    </>
                  )}
                </button>
              )}
              
              {activeTab === 'assign-id' && (
                <button
                  onClick={handleAssignIds}
                  disabled={!file || isAssigning || !fileContent || !idListText}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {isAssigning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang gắn ID...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-5 h-5" />
                      Bắt đầu gắn ID
                    </>
                  )}
                </button>
              )}

              {activeTab === 'image-to-latex' && (
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEssay}
                      onChange={(e) => setIsEssay(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 font-medium">Câu hỏi tự luận (không thêm A, B, C, D)</span>
                  </label>
                  <button
                    onClick={generateLatexFromImage}
                    disabled={!imageBase64 || isGenerating}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang chuyển đổi...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5" />
                        Chuyển sang LaTeX
                      </>
                    )}
                  </button>
                </div>
              )}

              {activeTab === 'doc-to-latex' && (
                <button
                  onClick={generateLatexFromDoc}
                  disabled={!docBase64 || isDocGenerating}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {isDocGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Chuyển sang LaTeX
                    </>
                  )}
                </button>
              )}

              {activeTab === 'filter-by-id' && (
                <button
                  onClick={handleFilter}
                  disabled={filterFilesContent.length === 0 || isFiltering || !filterIdList}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {isFiltering ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang lọc...
                    </>
                  ) : (
                    <>
                      <Filter className="w-5 h-5" />
                      Lọc câu hỏi
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Results */}
        {result && activeTab === 'dedupe' && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              2. Kết quả phân tích
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Tổng số câu hỏi tìm thấy</p>
                  <p className="text-2xl font-bold text-slate-800">{result.totalQuestions}</p>
                </div>
              </div>
              
              <div className={`p-5 rounded-xl border shadow-sm flex items-center gap-4 ${
                result.duplicateGroups.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
              }`}>
                <div className={`p-3 rounded-full ${
                  result.duplicateGroups.length > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                }`}>
                  {result.duplicateGroups.length > 0 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-sm font-medium opacity-80">Số nhóm bị trùng lặp</p>
                  <p className="text-2xl font-bold">
                    {result.duplicateGroups.length}
                  </p>
                </div>
              </div>
            </div>

            {result.duplicateGroups.length > 0 ? (
              <div className="space-y-4">
                <h3 className="font-medium text-slate-700">Chi tiết các câu trùng lặp:</h3>
                {result.duplicateGroups.map((group, idx) => (
                  <div key={idx} className="bg-white border border-red-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <h4 className="font-semibold text-red-800">
                        Nhóm trùng lặp #{idx + 1} <span className="font-normal text-red-600">({group.length} câu giống nhau)</span>
                      </h4>
                    </div>
                    
                    <div className="p-4 grid md:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-600 mb-2 block">Nội dung câu hỏi:</span>
                        
                        <div className="flex gap-2 mb-2 overflow-x-auto pb-1 shrink-0">
                          {group.map((q, qIdx) => {
                            const isActive = (activeTabByGroup[idx] || 0) === qIdx;
                            return (
                              <button
                                key={q.id}
                                onClick={() => setActiveTabByGroup(prev => ({...prev, [idx]: qIdx}))}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                                  isActive 
                                    ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200'
                                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Câu số {q.questionNumber}
                              </button>
                            );
                          })}
                        </div>

                        <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 flex-1 overflow-y-auto font-mono whitespace-pre-wrap min-h-[12rem]">
                          {group[activeTabByGroup[idx] || 0].content}
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-sm font-medium text-slate-600 mb-2 block">Lựa chọn xử lý:</span>
                        <ul className="space-y-3">
                          {group.map((q, qIdx) => {
                            const isDeleted = deletedChunkIds.has(q.id);
                            return (
                              <li key={q.id} className={`flex items-start justify-between gap-3 p-3 rounded-lg border text-sm transition-colors ${
                                !isDeleted ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'
                              }`}>
                                <div className="flex items-start gap-3">
                                  <div className={`mt-0.5 p-1.5 rounded-md ${
                                      !isDeleted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {!isDeleted ? <ShieldCheck className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                  </div>
                                  <div 
                                    className="cursor-pointer"
                                    onClick={() => setActiveTabByGroup(prev => ({...prev, [idx]: qIdx}))}
                                  >
                                    <div className="font-semibold text-slate-800 flex items-center gap-2 mb-0.5 hover:text-blue-600 transition-colors">
                                      Câu số {q.questionNumber} 
                                      <span className="text-xs font-normal text-slate-500">(Dòng {q.startLine} - {q.endLine})</span>
                                    </div>
                                    <span className={`text-xs font-medium ${!isDeleted ? 'text-green-700' : 'text-red-600'}`}>
                                      {!isDeleted ? '✓ Sẽ được giữ lại' : '✗ Sẽ bị xóa'}
                                    </span>
                                  </div>
                                </div>
                                
                                <button
                                  onClick={() => {
                                    setDeletedChunkIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(q.id)) next.delete(q.id);
                                      else next.add(q.id);
                                      return next;
                                    });
                                  }}
                                  className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border shadow-sm transition-colors ${
                                    !isDeleted
                                      ? 'bg-white border-green-300 text-green-700 hover:bg-green-50'
                                      : 'bg-white border-red-300 text-red-700 hover:bg-red-50'
                                  }`}
                                >
                                  {!isDeleted ? 'Đổi thành Xóa' : 'Đổi thành Giữ lại'}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center text-green-800">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">Tuyệt vời! File sạch sẽ.</h3>
                <p>Không tìm thấy bất kỳ câu hỏi nào bị trùng lặp trong file của bạn.</p>
              </div>
            )}
          </section>
        )}

        {/* Section 3: Action Dedupe */}
        {result && activeTab === 'dedupe' && result.duplicateGroups.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-500">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Đã sẵn sàng tải xuống</h2>
              <p className="text-slate-500">
                Tạo một file mới với các câu hỏi trùng lặp đã được tự động loại bỏ (chỉ giữ lại bản đầu tiên).
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handlePreviewPdf(result.chunks.map(c => c.content).join(''))}
                className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <Eye className="w-5 h-5" />
                Xem trước PDF
              </button>
              <button
                onClick={handleDownloadDedupe}
                className="py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Tải file LaTeX đã lọc
              </button>
            </div>
          </section>
        )}

        {/* Section 2: Assign ID Results */}
        {assignResult && activeTab === 'assign-id' && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              2. Kết quả gắn ID
            </h2>
            
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium mb-1">Tổng số câu hỏi</p>
                <p className="text-2xl font-bold text-slate-800">{assignResult.totalQuestions}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium mb-1">Đã có ID</p>
                <p className="text-2xl font-bold text-slate-800">{assignResult.questionsWithId}</p>
              </div>
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-200 shadow-sm">
                <p className="text-sm text-blue-600 font-medium mb-1">Thiếu ID (Cần gắn)</p>
                <p className="text-2xl font-bold text-blue-800">{assignResult.questionsMissingId}</p>
              </div>
              <div className="bg-green-50 p-5 rounded-xl border border-green-200 shadow-sm">
                <p className="text-sm text-green-600 font-medium mb-1">Đã gắn thành công</p>
                <p className="text-2xl font-bold text-green-800">{assignResult.assignedCount}</p>
              </div>
            </div>

            {assignResult.questionsMissingId > assignResult.assignedCount && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-800">Không đủ ID được cung cấp</h4>
                  <p className="text-amber-700 text-sm mt-1">
                    Có {assignResult.questionsMissingId} câu thiếu ID, nhưng bạn chỉ cung cấp đủ để gắn cho {assignResult.assignedCount} câu. {assignResult.questionsMissingId - assignResult.assignedCount} câu vẫn chưa được gắn ID.
                  </p>
                </div>
              </div>
            )}

            {assignResult.remainingIds > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-800">ID còn dư</h4>
                  <p className="text-blue-700 text-sm mt-1">
                    Bạn đã cung cấp nhiều ID hơn số lượng cần thiết. Còn lại {assignResult.remainingIds} ID chưa được sử dụng.
                  </p>
                </div>
              </div>
            )}

            {assignResult.assignedCount > 0 ? (
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Đã hoàn tất gắn ID</h2>
                  <p className="text-slate-500">
                    File đã được tự động gắn ID cho {assignResult.assignedCount} câu hỏi.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handlePreviewPdf(assignResult.updatedContent)}
                    className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Eye className="w-5 h-5" />
                    Xem trước PDF
                  </button>
                  <button
                    onClick={handleDownloadAssign}
                    className="py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Tải file LaTeX đã gắn ID
                  </button>
                </div>
              </section>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-600">
                <ShieldCheck className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">Không có câu hỏi nào cần gắn ID</h3>
                <p>Tất cả {assignResult.totalQuestions} câu hỏi trong file đều đã có ID.</p>
              </div>
            )}
          </section>
        )}

        {/* Section 2: Image to LaTeX Results */}
        {activeTab === 'image-to-latex' && generatedLatex && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                2. Kết quả LaTeX
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePreviewPdf(generatedLatex)}
                  className="text-sm flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Xem trước PDF
                </button>
                <button
                  onClick={() => downloadFile(generatedLatex, 'generated_question.tex')}
                  className="text-sm flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Tải file
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLatex);
                  }}
                  className="text-sm flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Sao chép
                </button>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <textarea
                value={generatedLatex}
                onChange={(e) => setGeneratedLatex(e.target.value)}
                className="w-full p-6 h-96 font-mono text-sm bg-slate-50 border-none outline-none resize-none focus:ring-0"
                spellCheck={false}
              />
            </div>
          </section>
        )}

        {/* Section 2: Document to LaTeX Results */}
        {activeTab === 'doc-to-latex' && docGeneratedLatex && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                2. Kết quả LaTeX
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePreviewPdf(docGeneratedLatex)}
                  className="text-sm flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Xem trước PDF
                </button>
                <button
                  onClick={() => downloadFile(docGeneratedLatex, 'document_questions.tex')}
                  className="text-sm flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Tải file
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(docGeneratedLatex);
                  }}
                  className="text-sm flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Sao chép
                </button>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <textarea
                value={docGeneratedLatex}
                onChange={(e) => setDocGeneratedLatex(e.target.value)}
                className="w-full p-6 h-96 font-mono text-sm bg-slate-50 border-none outline-none resize-none focus:ring-0"
                spellCheck={false}
              />
            </div>
          </section>
        )}

        {/* Section 2: Filter Results */}
        {filterResult && activeTab === 'filter-by-id' && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              2. Kết quả lọc
            </h2>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Thống kê tổng quan</h3>
                  <p className="text-slate-500 text-sm mt-1">
                    Tìm thấy <span className="font-bold text-blue-600">{filterResult.matchCount}</span> câu hỏi khớp ID trong tổng số {filterResult.totalCount} câu hỏi từ {filterFiles.length} file.
                  </p>
                </div>
                {filterResult.matchCount > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handlePreviewPdf(filterResult.content)}
                      className="text-sm flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Xem trước PDF
                    </button>
                    <button
                      onClick={handleDownloadFilter}
                      className="text-sm flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Tải file LaTeX
                    </button>
                  </div>
                )}
              </div>

              {filterResult.details && filterResult.details.length > 0 && (
                <div className="p-0">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th scope="col" className="px-6 py-3 rounded-tl-lg">ID Yêu Cầu</th>
                        <th scope="col" className="px-6 py-3 text-center">Số lượng cần tìm</th>
                        <th scope="col" className="px-6 py-3 text-center">Số lượng tìm thấy</th>
                        <th scope="col" className="px-6 py-3 text-center rounded-tr-lg">Số lượng được lấy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterResult.details.map((detail, index) => (
                        <tr key={index} className="bg-white border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-900 font-mono">
                            {detail.id}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {detail.requested === '∞' ? 'Tất cả' : detail.requested}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${detail.found === 0 ? 'bg-red-100 text-red-700' : (detail.requested !== '∞' && detail.found < (detail.requested as number)) ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {detail.found}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${detail.selected === 0 ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                              {detail.selected}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {filterResult.matchCount === 0 && (
                <div className="p-8 text-center text-slate-500">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p>Không tìm thấy câu hỏi nào khớp với các ID đã nhập.</p>
                </div>
              )}
            </div>
          </section>
        )}

      </main>

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
    </div>
  );
}
