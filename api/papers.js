// api/papers.js
// Vercel Serverless Function — SerpAPI(Google Scholar)로 논문 10개를 가져오고,
// Gemini로 그 논문들의 공통 키워드를 뽑아 태깅해서 돌려줍니다.
// SERPAPI_KEY, GEMINI_API_KEY 둘 다 서버 쪽 환경변수로만 쓰이고, 브라우저에는 노출되지 않습니다.

function parsePublicationSummary(summary) {
  // 예: "D Acemoglu, A Makhdoumi… - American Economic Journal…, 2022 - pubs.aeaweb.org"
  const parts = (summary || '').split(' - ').map((s) => s.trim());
  const authorsPart = parts[0] || '';
  const journalYearPart = parts[1] || '';
  const yearMatch = journalYearPart.match(/(19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';
  const journal = journalYearPart.replace(/,?\s*(19|20)\d{2}/, '').trim();
  return { authorsPart, journal, year };
}

async function extractKeywords(geminiApiKey, rawPapers) {
  const MODEL = 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const systemPrompt = `당신은 학술 논문 분류 도우미입니다. 아래 논문 목록(제목·초록)을 보고:
1. 이 논문들 전체를 관통하는 핵심 연구 키워드를 한국어로 5개 뽑으세요 (2~4단어의 짧은 학술 용어).
2. 각 논문마다, 위 5개 키워드 중 그 논문에 실제로 해당하는 것만 골라 태깅하세요 (없으면 빈 배열).
목록에 없는 키워드를 새로 만들지 말고, 반드시 topKeywords 안에서만 골라 태깅하세요.`;

  const inputText = JSON.stringify(
    rawPapers.map((p) => ({ index: p.index, title: p.title, snippet: p.snippet }))
  );

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: inputText }] }],
    generationConfig: {
      maxOutputTokens: 1500,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          topKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
          paperKeywords: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                index: { type: 'INTEGER' },
                keywords: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['index', 'keywords'],
            },
          },
        },
        required: ['topKeywords', 'paperKeywords'],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini 키워드 추출 오류: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const serpApiKey = process.env.SERPAPI_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!serpApiKey) {
    return res.status(500).json({ error: '서버에 SERPAPI_KEY 환경변수가 설정되지 않았습니다.' });
  }
  if (!geminiApiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query 문자열이 필요합니다.' });
  }

  try {
    // 1) SerpAPI(Google Scholar)로 논문 10개 검색
    const serpUrl = `https://serpapi.com/search.json?engine=google_scholar&q=${encodeURIComponent(
      query
    )}&num=10&api_key=${serpApiKey}`;
    const serpRes = await fetch(serpUrl);
    if (!serpRes.ok) {
      const errText = await serpRes.text();
      return res.status(serpRes.status).json({ error: `SerpAPI 오류: ${errText}` });
    }
    const serpData = await serpRes.json();
    const results = Array.isArray(serpData.organic_results) ? serpData.organic_results : [];

    const rawPapers = results.slice(0, 10).map((r, idx) => {
      const summary = r.publication_info?.summary || '';
      const { authorsPart, journal, year } = parsePublicationSummary(summary);
      let authors = authorsPart;
      if (Array.isArray(r.publication_info?.authors) && r.publication_info.authors.length) {
        authors = r.publication_info.authors.map((a) => a?.name).filter(Boolean).join(', ');
      }
      return {
        index: idx,
        id: r.result_id || r.link || `paper-${idx}`,
        title: r.title || '제목 없음',
        authors: authors || '저자 정보 없음',
        year: year || '연도 미상',
        journal: journal || '학술지 정보 없음',
        citationCount: r.inline_links?.cited_by?.total ?? 0,
        snippet: r.snippet || '',
      };
    });

    // 2) Gemini로 키워드 추출 (실패해도 논문 데이터는 그대로 반환하되, 실패 이유는 알려줌)
    let keywordMap = new Map();
    let keywordError = null;
    try {
      const kw = await extractKeywords(geminiApiKey, rawPapers);
      (kw.paperKeywords || []).forEach((pk) => {
        keywordMap.set(pk.index, Array.isArray(pk.keywords) ? pk.keywords : []);
      });
    } catch (err) {
      keywordMap = new Map();
      keywordError = err.message || '키워드 추출 중 알 수 없는 오류';
    }

    const papers = rawPapers.map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      journal: p.journal,
      citationCount: `인용 횟수: ${p.citationCount}`,
      keywords: keywordMap.get(p.index) || [],
      summarySections: [
        { heading: '초록', body: p.snippet || '요약 정보가 제공되지 않습니다.' },
      ],
    }));

    return res.status(200).json({ papers, keywordError });
  } catch (err) {
    return res.status(500).json({ error: err.message || '알 수 없는 오류' });
  }
}
