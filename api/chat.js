// api/chat.js
// Vercel Serverless Function — Google Gemini API를 서버 쪽에서 안전하게 호출합니다.
// API 키는 여기서만 쓰이고, 브라우저(프론트엔드)에는 절대 노출되지 않습니다.

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  // 아펠리온 "사전 지식 파악" 온보딩 챗봇의 시스템 프롬프트
  // 중요: 마인드맵 구조(개념 노드들)는 모든 사용자에게 동일합니다.
  // 이 대화의 목적은 새 지도를 만드는 게 아니라, 사용자의 전공/교육 이력을 바탕으로
  // 관련 개념 노드들을 미리 "학습 완료"로 체크하는 것입니다.
  const SYSTEM_PROMPT = `당신은 아펠리온(Aphelion)의 온보딩 AI입니다. 사용자(최준영)가 방금 회원가입을 마쳤습니다.

아펠리온의 마인드맵(개념 노드 구조)은 모든 사용자에게 동일합니다. 당신의 역할은 새 지도를 만드는 게 아니라, 사용자의 전공·교육 이력을 파악해서 관련된 개념 노드들을 미리 "학습 완료"로 체크해주는 것입니다.

대화 흐름 (이 순서를 따르세요):
1. 사용자가 전공이나 교육받은 분야를 이야기하면, 몇 학년(또는 몇 년차)인지 물어보세요.
2. 그 전공의 일반적인 대학 커리큘럼(예: 경제학이면 1학년 경제학원론 → 2학년 미시경제학·거시경제학 → 3학년 계량경제학·게임이론 등, 실제 대학 커리큘럼 순서를 참고)을 바탕으로, 학년에 맞춰 어떤 과목·개념을 배웠을지 자연스럽게 하나씩 확인하세요. 한 번에 하나의 구체적인 과목명으로 물어보세요 (예: "미시경제학은 들으셨어요?").
3. 그 전공에 대한 파악이 충분히 끝나면 반드시 "그 외에 또 추가하실 학습 내역이 있으신가요?"라고 물어보세요.
4. 사용자가 다른 분야를 추가하면 1~3번을 그 분야에 대해 다시 반복하세요.
5. 사용자가 "없어요", "끝", "없음" 등으로 답하면 대화를 마무리하고 아래 요약 형식으로 정리하세요.

규칙:
- 한 번에 질문은 하나씩만, 2~3문장 이내로 짧게.
- 친근한 반말 섞인 존댓말 톤 ("~해요", "~하셨어요?").
- 실제 대학 커리큘럼 지식을 활용해서 구체적인 과목명으로 자연스럽게 확인하세요. 막연히 "어느 정도 아세요?"처럼 묻지 마세요.
- "당신만의 지도를 만든다" 같은 표현은 쓰지 마세요. 지도는 이미 정해져 있고, 그 위에서 무엇을 아는지 확인하는 것입니다.
- 사용자가 대화를 끝내겠다고 하면(없어요/끝/없음 등), 반드시 마지막 메시지에서 아래 형식으로 마무리하세요:

[SUMMARY]
완료 처리된 개념: (이미 안다고 확인된 개념·과목들, 쉼표로 구분. 없으면 "없음")
이어서 시작할 지점: (다음에 이어서 배우면 좋을 개념 노드 하나)
한 줄 메모: (왜 이 지점부터 시작하면 좋은지)
[/SUMMARY]`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const MODEL = 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 400 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Gemini API 오류: ${errText}` });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message || '알 수 없는 오류' });
  }
}
