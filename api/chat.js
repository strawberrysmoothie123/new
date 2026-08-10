// api/chat.js
// Vercel Serverless Function — 온보딩 사전지식 파악 챗봇.
// NVIDIA Build(NIM API)를 사용합니다 (Gemini 무료/유료 등급의 반복적인 한도 문제를 피하기 위해 전환).
// NVDIA_KEY는 서버에서만 쓰이고 브라우저에는 절대 노출되지 않습니다.

const MODEL = 'meta/llama-3.1-70b-instruct';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const KNOWN_NODES = [
  "법경제학", "정보경제학", "미시경제학", "거시금융론",
  "국제경제학", "거시경제학", "헌법학", "행정법학", "민법학",
];

const BASE_SYSTEM_PROMPT = `당신은 아펠리온(Aphelion)의 온보딩 AI입니다. 사용자(최준영)가 방금 회원가입을 마쳤습니다. 반드시 한국어로만 답변하세요.

아펠리온의 마인드맵(개념 노드 구조)은 모든 사용자에게 동일합니다. 당신의 역할은 새 지도를 만드는 게 아니라, 사용자의 전공·교육 이력을 파악해서 관련된 개념 노드들을 미리 "학습 완료"로 체크해주는 것입니다.

실제 지도에 존재하는 개념 노드 목록 (이 이름만 정확히 사용하세요, 절대 변형하거나 새로 만들지 마세요):
${KNOWN_NODES.join(", ")}

대화 흐름 (이 순서를 따르세요):
1. 사용자가 전공이나 교육받은 분야를 이야기하면, 몇 학년(또는 몇 년차)인지 물어보세요.
2. 위 노드 목록 중 그 전공과 관련 있는 것들을 하나씩, 자연스럽게 확인하세요 (예: "미시경제학은 들으셨어요?"). 목록에 없는 과목명은 언급하지 마세요.
3. 확인이 충분히 끝나면 반드시 "그 외에 또 추가하실 학습 내역이 있으신가요?"라고 물어보세요.
4. 사용자가 다른 분야를 추가하면 1~3번을 반복하세요.

규칙:
- 한 번에 질문은 하나씩만, 2~3문장 이내로 짧게.
- 친근한 반말 섞인 존댓말 톤 ("~해요", "~하셨어요?").
- "당신만의 지도를 만든다" 같은 표현은 쓰지 마세요.
- 반드시 한국어로만 답하세요, 영어를 섞지 마세요.`;

const FINALIZE_INSTRUCTION = `

지금까지의 대화 전체를 바탕으로, 사용자에게 보여줄 짧은 마무리 인사말과 함께 완료된 개념을 정리해서 응답하세요.
- completed: 위 9개 노드 이름 중, 대화에서 이미 안다고 확인된 것만 정확한 철자로 담으세요. 없으면 빈 배열.
- next: 위 9개 노드 이름 중 이어서 배우면 좋을 하나.
- note: 왜 그 지점부터 시작하면 좋은지 한 줄.

반드시 아래 형식의 순수 JSON 객체 하나만 출력하세요. 다른 설명이나 코드블록 없이:
{"reply": "...", "completed": ["법경제학"], "next": "정보경제학", "note": "..."}`;

function extractJsonObject(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 형식을 찾을 수 없습니다.');
  return JSON.parse(cleaned.slice(start, end + 1));
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

  const apiKey = process.env.NVDIA_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 NVDIA_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { messages, finalize } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  const systemPrompt = finalize
    ? `${BASE_SYSTEM_PROMPT}${FINALIZE_INSTRUCTION}`
    : BASE_SYSTEM_PROMPT;

  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const requestBody = {
    model: MODEL,
    messages: openaiMessages,
    max_tokens: finalize ? 900 : 400,
    temperature: 0.6,
    top_p: 0.9,
  };
  if (finalize) {
    requestBody.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `NVIDIA API 오류: ${errText}` });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    if (!finalize) {
      return res.status(200).json({ text: rawText, finalize: false });
    }

    // finalize 모드: JSON을 파싱해서 깨끗한 형태로 다시 직렬화한 뒤 반환
    // (프론트가 JSON.parse(data.text)로 바로 처리하므로, 코드블록 등 잡음을 여기서 제거)
    try {
      const parsed = extractJsonObject(rawText);
      return res.status(200).json({ text: JSON.stringify(parsed), finalize: true });
    } catch (e) {
      return res.status(500).json({ error: '요약 응답이 유효한 JSON이 아닙니다: ' + rawText.slice(0, 200) });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || '알 수 없는 오류' });
  }
}
