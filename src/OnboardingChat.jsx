import React, { useState, useRef, useEffect } from 'react';

const NAVY = '#12283C';
const ICE = '#EAF4FC';
const ICE2 = '#D9EDFB';
const ORANGE = '#D9612A';
const MUTED = 'rgba(18,40,60,0.65)';

function parseSummary(text) {
  const match = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  if (!match) return null;
  const block = match[1];
  const get = (label) => {
    const m = block.match(new RegExp(label + '\\s*:\\s*(.+)'));
    return m ? m[1].trim() : '';
  };
  return {
    concept: get('추천 시작 개념'),
    level: get('학습자 수준'),
    reason: get('한 줄 추천 이유'),
  };
}

function stripSummary(text) {
  return text.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/, '').trim();
}

export default function OnboardingChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '안녕하세요! 아펠리온의 AI 학습 내비게이션이에요. 오늘은 어떤 걸 배워보고 싶으세요?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 실패');

      const rawText = data.text || '';
      const parsedSummary = parseSummary(rawText);
      const displayText = stripSummary(rawText);

      setMessages((prev) => [...prev, { role: 'assistant', content: displayText || rawText }]);
      if (parsedSummary) setSummary(parsedSummary);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${ICE} 0%, ${ICE2} 45%, ${ICE} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          border: `1px solid rgba(18,40,60,0.1)`,
          boxShadow: '0 20px 60px -20px rgba(18,40,60,0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '85vh',
          maxHeight: 700,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid rgba(18,40,60,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: NAVY,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            AI
          </div>
          <div>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>AI 학습 내비게이션</div>
            <div style={{ fontSize: 11, color: MUTED }}>아펠리온 · 사전 지식 파악</div>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                background: m.role === 'user' ? NAVY : 'white',
                color: m.role === 'user' ? 'white' : NAVY,
                padding: '10px 14px',
                borderRadius: 16,
                borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                fontSize: 13.5,
                lineHeight: 1.5,
                boxShadow: m.role === 'assistant' ? '0 2px 10px -4px rgba(18,40,60,0.15)' : 'none',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          ))}

          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'white',
                padding: '10px 14px',
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                fontSize: 13,
                color: MUTED,
                boxShadow: '0 2px 10px -4px rgba(18,40,60,0.15)',
              }}
            >
              입력 중…
            </div>
          )}

          {error && (
            <div style={{ alignSelf: 'center', color: '#B23A3A', fontSize: 12, textAlign: 'center' }}>
              오류: {error}
            </div>
          )}

          {summary && (
            <div
              style={{
                marginTop: 8,
                background: 'white',
                border: `1px solid rgba(18,40,60,0.1)`,
                borderRadius: 16,
                padding: 16,
                boxShadow: '0 4px 20px -8px rgba(18,40,60,0.2)',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: ORANGE, marginBottom: 6 }}>
                추천 학습 목표
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{summary.concept}</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                수준: {summary.level} · {summary.reason}
              </div>
              <button
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: 999,
                  border: 'none',
                  background: NAVY,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => alert('실제 제품에서는 여기서 학습 경로가 시작됩니다.')}
              >
                경로 적용하기
              </button>
            </div>
          )}
        </div>

        {/* input */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(18,40,60,0.08)', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요…"
            disabled={loading}
            style={{
              flex: 1,
              border: `1px solid rgba(18,40,60,0.15)`,
              borderRadius: 999,
              padding: '10px 16px',
              fontSize: 13.5,
              outline: 'none',
              background: 'white',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: NAVY,
              color: 'white',
              fontSize: 16,
              cursor: 'pointer',
              flexShrink: 0,
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
