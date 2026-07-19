import React, { useState, useEffect, useRef } from 'react';

// Calls Anthropic, OpenAI, or Gemini directly from the browser.
async function callModel(provider, apiKey, messages, systemPrompt) {
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic ${res.status}: ${t.slice(0,200)}`);
    }
    const data = await res.json();
    return data.content.map(b => b.text || '').join('');
  } else if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 4096 },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini ${res.status}: ${t.slice(0,200)}`);
    }
    const data = await res.json();
    const cand = data.candidates && data.candidates[0];
    if (!cand || !cand.content) throw new Error('Gemini returned no content (possibly blocked or empty).');
    return cand.content.parts.map(p => p.text || '').join('');
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))]
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI ${res.status}: ${t.slice(0,200)}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

// Pull task objects out of a model reply, tolerating format variations.
function extractTasks(text) {
  const candidates = [];

  // 1. Any fenced code block (```json, ```JSON, or just ```)
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1] && m[1].trim()) candidates.push(m[1].trim());
  }

  // 2. A bare [ ... ] array anywhere
  const arr = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arr) candidates.push(arr[0]);

  // 3. The whole text, in case it's pure JSON
  candidates.push(text.trim());

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (parsed) return parsed;
  }
  return null;
}

function tryParse(str) {
  let data;
  try { data = JSON.parse(str); }
  catch (e) {
    // try trimming to the outermost array or object
    const a = str.indexOf('['), b = str.lastIndexOf(']');
    const o = str.indexOf('{'), p = str.lastIndexOf('}');
    let slice = null;
    if (a !== -1 && b !== -1 && b > a) slice = str.slice(a, b+1);
    else if (o !== -1 && p !== -1 && p > o) slice = str.slice(o, p+1);
    if (slice) {
      try { data = JSON.parse(slice); } catch (e2) { data = repairTruncatedArray(str); }
    } else {
      data = repairTruncatedArray(str);
    }
    if (!data) return null;
  }
  let list = Array.isArray(data) ? data : [data];
  const normalized = list.map(normalizeTask).filter(Boolean);
  return normalized.length ? normalized : null;
}

// Recover complete task objects from a JSON array that got cut off mid-stream.
function repairTruncatedArray(str) {
  const start = str.indexOf('[');
  if (start === -1) return null;
  // walk forward tracking brace depth; collect each top-level {...} object
  const objects = [];
  let depth = 0, objStart = -1, inStr = false, prev = '';
  for (let i = start + 1; i < str.length; i++) {
    const ch = str[i];
    if (inStr) { if (ch === '"' && prev !== '\\') inStr = false; prev = ch; continue; }
    if (ch === '"') { inStr = true; prev = ch; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && objStart !== -1) { objects.push(str.slice(objStart, i+1)); objStart = -1; } }
    prev = ch;
  }
  if (objects.length === 0) return null;
  try { return JSON.parse('[' + objects.join(',') + ']'); }
  catch (e) { return null; }
}

function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  const title = t.title || t.name || t.task || t.summary || t.event || '';
  if (!title) return null;
  const startDate = t.startDate || t.start_date || t.date || t.dueDate || t.due_date || t.day || '';
  const endDate = t.endDate || t.end_date || '';
  let time = t.time || t.startTime || t.start_time || '';
  time = normalizeTime(time);
  let endTime = t.endTime || t.end_time || '';
  endTime = normalizeTime(endTime);
  return {
    title: String(title),
    role: t.role || '',
    priority: (t.priority || 'medium').toLowerCase(),
    startDate,
    endDate,
    time,
    endTime,
    notes: t.notes || t.note || t.description || ''
  };
}

function normalizeTime(v) {
  if (!v) return '';
  v = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(v)) {
    const [h,m] = v.split(':');
    return `${String(parseInt(h,10)).padStart(2,'0')}:${m}`;
  }
  const ampm = v.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|AM|PM)$/);
  if (ampm) {
    let h = parseInt(ampm[1],10);
    const min = ampm[2] || '00';
    const isPM = ampm[3].toLowerCase() === 'pm';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${min}`;
  }
  return ''; // unrecognized -> treat as no time (becomes a priority)
}

export default function AIPanel({ roles, weekContext, onAddTasks, onClose }) {
  const [provider, setProvider] = useState(localStorage.getItem('planner-ai-provider') || 'anthropic');
  const [apiKey, setApiKey] = useState(localStorage.getItem('planner-ai-key') || '');
  const [keyInput, setKeyInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftTasks, setDraftTasks] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, draftTasks]);

  function saveKey() {
    if (!keyInput.trim()) return;
    localStorage.setItem('planner-ai-key', keyInput.trim());
    localStorage.setItem('planner-ai-provider', provider);
    setApiKey(keyInput.trim());
    setKeyInput('');
  }

  function clearKey() {
    localStorage.removeItem('planner-ai-key');
    setApiKey('');
  }

  const roleList = roles.map(r => `${r.id} = ${r.label}`).join(', ');
  const systemPrompt = `You are a planning assistant embedded in a weekly role-based planner.
The user's roles are: ${roleList}.
Here is their current week:
${weekContext}

If the user pastes a schedule, convert every item into a task object. The schedule may be a plain-text table with day headers (e.g. "Monday, June 29") followed by rows like "10:00–11:30  Task name". For each row: use the most recent day header as the date, parse the start of the time range as "time" and the end as "endTime". Assume business-hours interpretation — times like 10:00, 11:30 are AM; 1:00, 2:00, 3:30, 4:45 are PM (afternoon) unless context says otherwise. Convert all times to 24-hour "HH:MM". Put a one-line summary before the block. Always include the JSON block when tasks are involved. Keep replies concise.

Each task object uses these fields:
{ "title": string, "role": one of the role ids above, "priority": "low"|"medium"|"high", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" (optional), "time": "HH:MM" 24h start, "endTime": "HH:MM" 24h end (optional), "notes": string (optional) }
Keep the "title" short and scannable (a few words). Put any agenda, attendee list, sub-items, links, or extra detail in "notes", NEVER in the title. For example, a meeting whose agenda covers several topics should have a short title like "Mark/Nadir Touchpoint" and the agenda in notes.`;

  async function send() {
    if (!input.trim() || loading) return;
    setError('');
    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const reply = await callModel(provider, apiKey, newMessages, systemPrompt);
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
      const tasks = extractTasks(reply);
      if (tasks && tasks.length) setDraftTasks(tasks);
    } catch (e) {
      setError(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function addDrafts() {
    if (draftTasks) {
      onAddTasks(draftTasks);
      setDraftTasks(null);
    }
  }

  // strip the json block from displayed assistant text for readability
  function displayText(text) {
    let cleaned = text.replace(/```(?:json|JSON)?[\s\S]*?```/g, '').trim();
    // if stripping the block left nothing, show a friendly line
    if (!cleaned) cleaned = 'Drafted tasks below — review and add them to your planner.';
    return cleaned;
  }

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <span>✨ AI Assistant</span>
        <button className="ai-close" onClick={onClose}>×</button>
      </div>

      {!apiKey ? (
        <div className="ai-setup">
          <p className="ai-setup-text">Connect an AI model. Your key is stored only in this browser.</p>
          <label>Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="gemini">Google (Gemini)</option>
          </select>
          <label>API Key</label>
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'AIza...' : 'sk-...'} />
          <button className="ai-btn-primary" onClick={saveKey}>Save Key</button>
          <p className="ai-setup-hint">
            {provider === 'anthropic'
              ? 'Get a key at console.anthropic.com → API Keys'
              : provider === 'gemini'
              ? 'Get a key at aistudio.google.com → Get API key'
              : 'Get a key at platform.openai.com → API Keys'}
          </p>
        </div>
      ) : (
        <>
          <div className="ai-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                Ask me to plan your week, draft tasks, or think through priorities.
                <div className="ai-suggestions">
                  <button onClick={() => setInput('Look at my week and suggest what to prioritize.')}>Suggest priorities</button>
                  <button onClick={() => setInput('Draft tasks for launching a single this week.')}>Draft a launch plan</button>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role}`}>
                {m.role === 'assistant' ? displayText(m.content) : m.content}
              </div>
            ))}
            {loading && <div className="ai-msg ai-msg-assistant ai-loading">Thinking…</div>}
            {draftTasks && (
              <div className="ai-drafts">
                <div className="ai-drafts-head">{draftTasks.length} task{draftTasks.length>1?'s':''} ready</div>
                {draftTasks.map((t, i) => (
                  <div key={i} className="ai-draft-item">
                    <strong>{t.title}</strong>
                    <span className="ai-draft-meta">{(roles.find(r=>r.id===t.role)||{}).label || t.role} · {t.priority} · {t.startDate}{t.time?` ${t.time}`:''}</span>
                  </div>
                ))}
                <div className="ai-draft-actions">
                  <button className="ai-btn-secondary" onClick={() => setDraftTasks(null)}>Dismiss</button>
                  <button className="ai-btn-primary" onClick={addDrafts}>Add to Planner</button>
                </div>
              </div>
            )}
          </div>

          {error && <div className="ai-error">{error}</div>}

          <div className="ai-input-row">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask anything…"
              rows="2"
            />
            <button className="ai-send" onClick={send} disabled={loading}>↑</button>
          </div>
          <div className="ai-footer">
            <span>{provider === 'anthropic' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'GPT'} · key saved</span>
            <button className="ai-link" onClick={clearKey}>change key</button>
          </div>
        </>
      )}
    </div>
  );
}
