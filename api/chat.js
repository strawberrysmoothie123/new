// api/chat.js
// Vercel Serverless Function — Claude API를 서버 쪽에서 안전하게 호출합니다.
// API 키는 여기서만 쓰이고, 브라우저(프론트엔드)에는 절대 노출되지 않습니다.

export default async function handler(req, res) {
  // CORS (Framer 등 다른 도메인에서 이 API를 호출할 수 있게 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  // 아펠리온 "사전 지식 파악" 온보딩 챗봇의 시스템 프롬프트
  const SYSTEM_PROMPT = `당신은 아펠리온(Aphelion)의 AI 학습 내비게이션입니다.
새로 가입한 학습자와 짧게 대화하며 아래 정보를 자연스럽게 파악하세요:
1. 어떤 분야/과목을 배우고 싶은지
2. 관련 배경지식이 어느 정도인지 (완전 초보 / 어느 정도 알고 있음 / 심화 학습 원함)
3. 구체적으로 궁금한 개념이나 목표가 있는지

규칙:
- 한 번에 질문은 하나씩만 하세요. 너무 길게 말하지 마세요 (2~3문장 이내).
- 친근하고 간결한 반말 섞인 존댓말 톤을 쓰세요 ("~해요", "~할까요?").
- 사용자가 답변하면 자연스럽게 다음 질문으로 이어가세요.
- 충분한 정보(분야, 배경지식 수준, 목표)가 모이면, 마지막 메시지에서 반드시 아래 형식으로 요약하고 대화를 마무리하세요:

[SUMMARY]
추천 시작 개념: (개념 이름)
학습자 수준: (초급/중급/고급)
한 줄 추천 이유: (이유)
[/SUMMARY]

보통 3~4번의 대화 턴 안에 요약까지 도달하도록 진행하세요.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages, // [{role: 'user'|'assistant', content: '...'}, ...]
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Claude API 오류: ${errText}` });
    }

    const data = await response.json();
    const text = data.content?.map((b) => b.text || '').join('') || '';

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message || '알 수 없는 오류' });
  }
}
