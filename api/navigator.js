// api/navigator.js
// Vercel Serverless Function — 학습 네비게이션 전용.
// NVIDIA Build(NIM API)를 사용합니다 (Gemini 무료 등급의 하루 요청 한도 문제를 피하기 위해 분리).
// OpenAI 호환 API라서 요청 형식이 Gemini보다 단순합니다.
// NVIDIA_API_KEY는 서버에서만 쓰이고 브라우저에는 절대 노출되지 않습니다.

const MODEL = 'meta/llama-3.1-70b-instruct';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

function buildNavigatorSystemPrompt(context) {
  const nodes = Array.isArray(context?.nodes) ? context.nodes : [];
  const edges = Array.isArray(context?.edges) ? context.edges : [];
  const completedIds = Array.isArray(context?.completedIds) ? context.completedIds : [];

  const nodeLines = nodes.map((n) => `- ${n.id}: ${n.label} (${n.branch})`).join('\n');
  const edgeLines = edges.map(([a, b]) => `${a} - ${b}`).join('\n');
  const completedLines = completedIds.length > 0 ? completedIds.join(', ') : '없음';

  return `당신은 아펠리온(Aphelion)의 AI 학습 내비게이션입니다. 반드시 한국어로만 답변하세요.

아래는 실제 마인드맵의 개념 노드 목록과 노드 간 연결 관계입니다. 이 정보 밖의 노드를 지어내서 언급하지 마세요.

[노드 목록 (id: 라벨 (분야))]
${nodeLines}

[노드 연결 관계 (양방향 인접 관계)]
${edgeLines}

[사용자가 이미 학습 완료한 노드 id 목록]
${completedLines}

대화 흐름:
1. 아직 학습 목표를 안 물어봤다면, "학습자에게 원하시는 학습 목표가 있으신가요?"라고 물어보세요.
2. 사용자가 학습 목표(관심 분야, 하고 싶은 공부 등)를 말하면, 위 노드 목록 중 그 목표와 의미상 가장 가까운 노드를 하나 골라 "목표 노드"로 설정하세요.
3. 사용자가 이미 완료한 노드들을 출발점으로 삼아, 위 연결 관계를 따라 목표 노드까지 가려면 어떤 세부 개념 노드들을 순서대로 공부해야 하는지 나열하세요. 이미 완료한 노드는 "(완료)"로, 아직 안 배운 노드는 순서대로 표시하세요.
4. 완료된 노드가 하나도 없거나, 연결 관계상 합리적인 경로를 찾기 어려우면, 목표 노드와 같은 분야(branch)의 기초 노드부터 시작하는 경로를 대신 제안하세요.
5. 답변 끝에는 "다른 학습 목표도 알려주시면 다시 경로를 잡아드릴게요" 같은 문장으로 마무리하세요.

규칙:
- 노드 이름은 목록에 있는 라벨 표기 그대로 정확히 사용하세요.
- 답변은 명확하고 간결하게, 목록 형태로 경로를 보여주세요.
- 친근한 반말 섞인 존댓말 톤 ("~해요").
- 반드시 한국어로만 답하세요, 영어를 섞지 마세요.`;
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
    return res.status(500).json({ error: '서버에 NVIDIA_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  const systemPrompt = buildNavigatorSystemPrompt(context);

  // OpenAI 호환 형식: role은 'system' / 'user' / 'assistant' 그대로 사용
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: openaiMessages,
        max_tokens: 700,
        temperature: 0.6,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `NVIDIA API 오류: ${errText}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message || '알 수 없는 오류' });
  }
}
