const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';

function getApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function getEndpoint(apiKey, model) {
  if (apiKey.startsWith('AQ.')) {
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function formatConversations(conversations = []) {
  if (!Array.isArray(conversations) || !conversations.length) return 'No conversations available.';
  return conversations.slice(0, 20).map(c => {
    const msgs = (c.msgs || []).slice(-15).map(m => {
      const sender = m.from === 'me' ? 'You' : c.name;
      return `  [${m.t || ''}] ${sender}: ${m.text || ''}`;
    }).join('\n');
    return `Conversation: ${c.name} (folder: ${c.folder || 'personal'}, status: ${c.status || 'Online'})\n${msgs || '  (no messages)'}`;
  }).join('\n\n');
}

function buildPayload(body) {
  const mode = body.mode || 'assistant';

  if (mode === 'summarize') {
    const contact = String(body.contactName || 'Contact').slice(0, 80);
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    const transcript = msgs.map(m => `[${m.t || ''}] ${m.from}: ${m.text}`).join('\n');
    return {
      wantsJson: false,
      systemInstruction: {
        parts: [{
          text: 'You summarize direct message threads for WhatsGram OS. Provide a concise, clear summary in 1-3 sentences or brief bullet points covering key points and any action items. Do not invent details outside the transcript.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Summarize this conversation with ${contact}:\n\n${transcript}` }]
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 450 }
    };
  }

  if (mode === 'smartReplies') {
    const contact = String(body.contactName || 'Contact').slice(0, 80);
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const transcript = msgs.map(m => `${m.from}: ${m.text}`).join('\n');
    return {
      wantsJson: true,
      wantsSuggestions: true,
      systemInstruction: {
        parts: [{
          text: 'Generate 3 short, natural reply suggestions for the user based on the recent messages. Keep each suggestion concise (under 8 words) and grounded in context. Respond strictly with JSON: {"suggestions":["...","...","..."]}.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Conversation with ${contact}:\n${transcript}\n\nProvide 3 smart replies:` }]
      }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 180,
        responseMimeType: 'application/json'
      }
    };
  }

  if (mode === 'reply') {
    const contact = String(body.contactName || 'Contact').slice(0, 80);
    const folder = String(body.folder || 'personal');
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const transcript = msgs.map(m => `${m.from}: ${m.text}`).join('\n');
    return {
      wantsJson: false,
      systemInstruction: {
        parts: [{
          text: `You are ${contact}, replying in a private direct message thread (${folder} folder) on WhatsGram. Reply naturally to the latest message from User in 1-2 brief, realistic chat sentences matching the conversation context. Return only the reply message text with no surrounding quotes or name prefix.`
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Recent thread messages:\n${transcript}\n\nWrite ${contact}'s next reply:` }]
      }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 220 }
    };
  }

  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  const activeChat = body.activeChatName ? String(body.activeChatName).slice(0, 80) : null;
  const contextText = formatConversations(body.conversations);
  const wantsDraft = /\b(draft|reply|respond|write back)\b/i.test(prompt);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  const contents = [
    ...history
      .filter(h => h && (h.role === 'user' || h.role === 'model') && h.text)
      .map(h => ({ role: h.role, parts: [{ text: String(h.text).slice(0, 2000) }] })),
    {
      role: 'user',
      parts: [{
        text: `${activeChat ? `Active open conversation: ${activeChat}\n\n` : ''}Local conversations:\n${contextText}\n\nUser request: ${prompt}`
      }]
    }
  ];

  if (wantsDraft) {
    return {
      wantsJson: true,
      systemInstruction: {
        parts: [{
          text: 'You are WhatsGram OS AI Assistant. Use only the provided local conversations. When the user asks to draft a reply, respond strictly with JSON: {"answer": "<helpful explanation or preview>", "draft": "<ready-to-send reply text>"}. Do not wrap JSON in markdown fences if possible.'
        }]
      },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
        responseMimeType: 'application/json'
      }
    };
  }

  return {
    wantsJson: false,
    systemInstruction: {
      parts: [{
        text: 'You are WhatsGram OS AI Assistant. Answer concisely and accurately using the provided local conversations. Reference contact names and facts directly without inventing messages.'
      }]
    },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
  };
}

async function callModel(apiKey, model, payload) {
  const reqBody = {
    systemInstruction: payload.systemInstruction,
    contents: payload.contents,
    generationConfig: { ...payload.generationConfig }
  };
  if (model.startsWith('gemini-2.5')) {
    reqBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await fetch(getEndpoint(apiKey, model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(reqBody)
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  const apiKey = getApiKey();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(apiKey),
      provider: apiKey ? (apiKey.startsWith('AQ.') ? 'vertex-express' : 'ai-studio') : 'none',
      model: DEFAULT_MODEL
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured in environment variables.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON request body.' });
  }

  const payload = buildPayload(body);

  try {
    let model = DEFAULT_MODEL;
    let result = await callModel(apiKey, model, payload);

    if (!result.ok && result.status === 404 && model !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      result = await callModel(apiKey, model, payload);
    }

    if (!result.ok) {
      const errMsg = result.data?.error?.message || `Gemini upstream error (${result.status})`;
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: errMsg });
    }

    const rawText = (result.data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from Gemini API.' });
    }

    if (payload.wantsJson) {
      const provider = apiKey.startsWith('AQ.') ? 'vertex-express' : 'ai-studio';
      try {
        const cleaned = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (payload.wantsSuggestions) {
          const suggestions = Array.isArray(parsed.suggestions)
            ? parsed.suggestions.slice(0, 3).map(x => String(x || '').trim()).filter(Boolean)
            : [];
          return res.status(200).json({ text: suggestions[0] || rawText, suggestions, model, provider });
        }
        return res.status(200).json({
          text: String(parsed.answer || parsed.draft || rawText),
          draft: parsed.draft ? String(parsed.draft) : null,
          model,
          provider
        });
      } catch {
        return res.status(200).json({
          text: rawText,
          draft: payload.wantsSuggestions ? null : rawText,
          ...(payload.wantsSuggestions ? { suggestions: [] } : {}),
          model,
          provider
        });
      }
    }

    return res.status(200).json({
      text: rawText,
      draft: null,
      model,
      provider: apiKey.startsWith('AQ.') ? 'vertex-express' : 'ai-studio'
    });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Failed to reach Gemini API.' });
  }
};
