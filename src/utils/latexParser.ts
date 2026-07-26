export type ChunkType = 'text' | 'question';

export interface Chunk {
  id: number;
  type: ChunkType;
  content: string; // Nguyên bản chuỗi text
  normalized?: string; // Đã chuẩn hóa (bỏ khoảng trắng, comment) để so sánh
  isDuplicate?: boolean;
  duplicateGroup?: number;
  questionNumber?: number; // Số thứ tự câu hỏi trong file
  startLine?: number; // Dòng bắt đầu
  endLine?: number; // Dòng kết thúc
}

export interface ParseResult {
  chunks: Chunk[];
  totalQuestions: number;
  duplicateGroups: Chunk[][]; // Mảng các nhóm câu hỏi bị trùng (mỗi nhóm >= 2 câu)
}

function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length < 2 || str2.length < 2) return str1 === str2 ? 1 : 0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(str1);
  const bg2 = getBigrams(str2);

  let intersectionSize = 0;
  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) || 0;
    intersectionSize += Math.min(count1, count2);
  }

  const totalSize = (str1.length - 1) + (str2.length - 1);
  return (2.0 * intersectionSize) / totalSize;
}

export function parseLatex(content: string, environments: string, similarityThreshold: number = 0.95): ParseResult {
  const envs = environments.split(',').map(e => e.trim()).filter(Boolean);
  
  if (envs.length === 0) {
    return { chunks: [{ id: 0, type: 'text', content }], totalQuestions: 0, duplicateGroups: [] };
  }

  // Tiền xử lý đếm dòng để lấy vị trí dòng nhanh chóng
  const lineIndices: number[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      lineIndices.push(i);
    }
  }

  const getLineNumber = (idx: number) => {
    let l = 0, r = lineIndices.length - 1;
    let ans = 0;
    while (l <= r) {
      const m = Math.floor((l + r) / 2);
      if (lineIndices[m] < idx) {
        ans = m + 1;
        l = m + 1;
      } else {
        r = m - 1;
      }
    }
    return ans + 1; // 1-indexed
  };

  const escapedEnvs = envs.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Hỗ trợ cả trường hợp có khoảng trắng giữa \begin và { 
  const regex = new RegExp(`\\\\begin\\s*\\{(${escapedEnvs})\\}([\\s\\S]*?)\\\\end\\s*\\{\\1\\}`, 'g');

  const chunks: Chunk[] = [];
  let lastIndex = 0;
  let match;
  let chunkId = 0;
  let questionCount = 0;

  while ((match = regex.exec(content)) !== null) {
    // Phần text bình thường nằm trước câu hỏi
    if (match.index > lastIndex) {
      chunks.push({
        id: chunkId++,
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }

    questionCount++;
    const questionContent = match[0];
    const innerContent = match[2]; 
    
    // Loại bỏ comment (%) để không ảnh hưởng việc so sánh
    const innerWithoutComments = innerContent.replace(/%.*$/gm, '');
    // Chuẩn hóa: bỏ tất cả khoảng trắng, xuống dòng, viết thường, và các dấu câu (chấm, phẩy...)
    const normalized = innerWithoutComments
      .replace(/\\s+/g, '')
      .replace(/[.,;:\\!\\?]/g, '')
      .toLowerCase();

    const startLine = getLineNumber(match.index);
    const endLine = getLineNumber(match.index + match[0].length);

    chunks.push({
      id: chunkId++,
      type: 'question',
      content: questionContent,
      normalized,
      questionNumber: questionCount,
      startLine,
      endLine
    });

    lastIndex = regex.lastIndex;
  }

  // Phần text còn lại ở cuối file
  if (lastIndex < content.length) {
    chunks.push({
      id: chunkId++,
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  // Tìm các câu trùng lặp dựa trên độ tương đồng (similarity)
  const questions = chunks.filter(c => c.type === 'question');
  const duplicateGroups: Chunk[][] = [];
  const visited = new Set<number>();
  let groupId = 0;

  for (let i = 0; i < questions.length; i++) {
    if (visited.has(i)) continue;
    const group = [questions[i]];
    visited.add(i);

    for (let j = i + 1; j < questions.length; j++) {
      if (visited.has(j)) continue;
      
      const q1 = questions[i].normalized || '';
      const q2 = questions[j].normalized || '';
      
      const sim = calculateSimilarity(q1, q2);
      if (sim >= similarityThreshold) {
        group.push(questions[j]);
        visited.add(j);
      }
    }

    if (group.length > 1) {
      group.forEach((q, idx) => {
        q.duplicateGroup = groupId;
        // Đánh dấu trùng lặp từ phần tử thứ 2 trở đi (giữ lại phần tử đầu tiên)
        if (idx > 0) {
          q.isDuplicate = true;
        }
      });
      duplicateGroups.push(group);
      groupId++;
    }
  }

  return {
    chunks,
    totalQuestions: questionCount,
    duplicateGroups
  };
}

export function generateFilteredFile(chunks: Chunk[]): string {
  return chunks
    .filter(c => !c.isDuplicate)
    .map(c => c.content)
    .join('');
}

export interface AssignIdResult {
  totalQuestions: number;
  questionsWithId: number;
  questionsMissingId: number;
  assignedCount: number;
  remainingIds: number;
  updatedContent: string;
}

export async function assignIds(content: string, environments: string, idListText: string): Promise<AssignIdResult | null> {
  const envs = environments.split(',').map(e => e.trim()).filter(Boolean);
  if (envs.length === 0) return null;
  
  const parsed = parseLatex(content, environments, 1.0); // We just need the chunks
  if (parsed.chunks.length === 0) return null;

  const idList = idListText.split('\n').map(s => s.trim()).filter(Boolean);
  
  let totalQuestions = 0;
  let questionsWithId = 0;
  let questionsMissingId = 0;
  
  const questionsToMatch: { id: number, content: string }[] = [];

  // Parse first line of each question to check for ID
  parsed.chunks.forEach(chunk => {
    if (chunk.type === 'question') {
      totalQuestions++;
      // Check if the \begin{...} line has a comment
      const firstLineEnd = chunk.content.indexOf('\n');
      const firstLine = firstLineEnd !== -1 ? chunk.content.slice(0, firstLineEnd) : chunk.content;
      if (firstLine.includes('%')) {
        questionsWithId++;
      } else {
        questionsMissingId++;
        questionsToMatch.push({ id: chunk.id, content: chunk.content });
      }
    }
  });

  let assignedCount = 0;
  const matchMap = new Map<number, string>();

  if (questionsToMatch.length > 0 && idList.length > 0) {
    try {
      const response = await fetch('/api/match-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questionsToMatch, ids: idList })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.matches && Array.isArray(data.matches)) {
          data.matches.forEach((m: any) => {
            matchMap.set(m.id, m.matchedId);
          });
        }
      }
    } catch (e) {
      console.error("Failed to match IDs via API", e);
    }
  }

  // Update chunks with matched IDs
  const updatedChunks = parsed.chunks.map(chunk => {
    if (chunk.type === 'question' && matchMap.has(chunk.id)) {
      let matchedId = matchMap.get(chunk.id)!;
      if (!matchedId.startsWith('[')) matchedId = `[${matchedId}]`;
      
      const firstLineEnd = chunk.content.indexOf('\n');
      if (firstLineEnd !== -1) {
        const firstLine = chunk.content.slice(0, firstLineEnd);
        const rest = chunk.content.slice(firstLineEnd);
        assignedCount++;
        return { ...chunk, content: `${firstLine} %${matchedId}${rest}` };
      } else {
        assignedCount++;
        return { ...chunk, content: `${chunk.content} %${matchedId}` };
      }
    }
    return chunk;
  });

  return {
    totalQuestions,
    questionsWithId,
    questionsMissingId,
    assignedCount,
    remainingIds: idList.length - assignedCount,
    updatedContent: updatedChunks.map(c => c.content).join('')
  };
}

export interface FilterResult {
  content: string;
  matchCount: number;
  totalCount: number;
  details: { id: string, requested: number | string, found: number, selected: number }[];
}

export function filterQuestionsByIds(files: {name: string, content: string}[], environments: string, idsText: string): FilterResult {
  const envs = environments.split(',').map(e => e.trim()).filter(Boolean);
  if (envs.length === 0 || files.length === 0) return { content: '', matchCount: 0, totalCount: 0, details: [] };
  
  const idsToMatch = idsText.split('\n').map(s => s.trim()).filter(Boolean);
  if (idsToMatch.length === 0) return { content: '', matchCount: 0, totalCount: 0, details: [] };

  const idPatterns = idsToMatch.map(idStr => {
    // Extract ID and optional count (e.g. "[6D1H1-1] 5" or "[6D1H1-1]: 5" or "[6D1H1-1], 5")
    const match = idStr.match(/^(.*?)(?:[:,\s]+(\d+))?$/);
    const actualId = match ? match[1].trim() : idStr;
    const limit = match && match[2] ? parseInt(match[2], 10) : Infinity;

    // Escape regex characters except ? and *
    const escaped = actualId.replace(/[.+^$\{}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\?/g, '.').replace(/\*/g, '.*');
    
    return {
      originalStr: actualId,
      requested: match && match[2] ? limit : '∞',
      regex: new RegExp(regexStr, 'i'),
      limit,
      matchedChunks: [] as string[]
    };
  });

  let totalCount = 0;
  
  let firstFilePreamble = '';
  let firstFilePostamble = '';

  files.forEach((file, index) => {
    const parsed = parseLatex(file.content, environments, 1.0);
    
    if (index === 0) {
      const firstQIdx = parsed.chunks.findIndex(c => c.type === 'question');
      let lastQIdx = -1;
      for (let i = parsed.chunks.length - 1; i >= 0; i--) {
        if (parsed.chunks[i].type === 'question') {
          lastQIdx = i;
          break;
        }
      }
      
      if (firstQIdx !== -1) {
        firstFilePreamble = parsed.chunks.slice(0, firstQIdx).map(c => c.content).join('');
      } else {
        firstFilePreamble = file.content;
      }
      
      if (lastQIdx !== -1) {
        firstFilePostamble = parsed.chunks.slice(lastQIdx + 1).map(c => c.content).join('');
      }
    }

    parsed.chunks.forEach(chunk => {
      if (chunk.type === 'question') {
        totalCount++;
        const firstLineEnd = chunk.content.indexOf('\n');
        const firstLine = firstLineEnd !== -1 ? chunk.content.slice(0, firstLineEnd) : chunk.content;
        
        for (const pattern of idPatterns) {
          if (pattern.regex.test(firstLine) || pattern.regex.test(chunk.content)) {
            pattern.matchedChunks.push(chunk.content);
            break;
          }
        }
      }
    });
  });

  let matchCount = 0;
  const finalMatchedQuestions: string[] = [];
  const details = [];

  for (const pattern of idPatterns) {
    let selectedChunks = pattern.matchedChunks;
    const foundCount = selectedChunks.length;
    
    if (pattern.limit !== Infinity && selectedChunks.length > pattern.limit) {
      // randomly shuffle and take limit
      const shuffled = [...selectedChunks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      selectedChunks = shuffled.slice(0, pattern.limit);
    }
    
    finalMatchedQuestions.push(...selectedChunks);
    matchCount += selectedChunks.length;
    
    details.push({
      id: pattern.originalStr,
      requested: pattern.requested,
      found: foundCount,
      selected: selectedChunks.length
    });
  }

  const finalContent = `${firstFilePreamble}${finalMatchedQuestions.join('\n')}${firstFilePostamble}`;

  return {
    content: finalContent,
    matchCount,
    totalCount,
    details
  };
}
