const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';

function getApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function getEndpoint(apiKey, model, stream = false) {
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  if (apiKey.startsWith('AQ.')) {
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:${action}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;
}

const AI_MEDIA_RE = /^(image\/(png|jpeg|jpg|webp|gif)|audio\/(webm|mp3|mpeg|wav|ogg|aac))$/i;

function buildMediaPart(media) {
  if (!media || typeof media !== 'object' || !media.dataBase64) return null;
  const mimeType = String(media.mimeType || '').split(';')[0].trim().toLowerCase();
  if (!AI_MEDIA_RE.test(mimeType)) return null;
  const data = String(media.dataBase64).replace(/^data:[^;]+;base64,/i, '').trim();
  if (!data || data.length > 6 * 1024 * 1024) return null;
  return { inlineData: { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data } };
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

  if (mode === 'rewrite') {
    const draftText = String(body.text || body.prompt || '').trim().slice(0, 2000);
    const tone = String(body.tone || 'polish').slice(0, 40);
    const targetLang = String(body.targetLang || 'Spanish').slice(0, 40);
    const contact = body.contactName ? String(body.contactName).slice(0, 80) : '';
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-6) : [];
    const transcript = msgs.map(m => `${m.from}: ${m.text}`).join('\n');
    const ruleMap = {
      fix: 'Fix spelling, grammar, and punctuation while keeping the exact meaning and tone.',
      polite: 'Rewrite to sound warm, polite, and respectful while keeping the core message clear.',
      concise: 'Rewrite to be short, direct, and crisp (1-2 brief sentences max) without losing meaning.',
      professional: 'Rewrite in a clear, polished, professional tone suitable for workplace messaging.',
      translate: `Translate accurately into ${targetLang}, preserving natural conversational phrasing.`
    };
    const rule = ruleMap[tone] || 'Improve clarity and natural phrasing while preserving intent.';
    return {
      wantsJson: false,
      isRewrite: true,
      systemInstruction: {
        parts: [{
          text: `You are WhatsGram AI writing assistant (similar to Meta AI in WhatsApp). ${rule} Return ONLY the rewritten message text with no surrounding quotes, explanations, or markdown formatting.`
        }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text: `${contact ? `Recipient: ${contact}\n` : ''}${transcript ? `Recent chat context:\n${transcript}\n\n` : ''}Draft message to process:\n${draftText}`
        }]
      }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 320 }
    };
  }

  if (mode === 'translate') {
    const srcText = String(body.text || body.prompt || '').trim().slice(0, 2000);
    const targetLang = String(body.targetLang || 'English').slice(0, 40);
    return {
      wantsJson: false,
      isRewrite: true,
      systemInstruction: {
        parts: [{ text: `Translate the following message cleanly and naturally into ${targetLang}. Return ONLY the translated text without quotes or commentary.` }]
      },
      contents: [{ role: 'user', parts: [{ text: srcText }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 320 }
    };
  }

  if (mode === 'transcribe') {
    const mediaPart = buildMediaPart(body.media);
    const parts = [{ text: 'Transcribe all spoken words from this voice note cleanly and concisely. Return only the transcript.' }];
    if (mediaPart) parts.push(mediaPart);
    return {
      wantsJson: false,
      systemInstruction: { parts: [{ text: 'You accurately transcribe voice messages for WhatsGram OS.' }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
    };
  }

  if (mode === 'caption') {
    const seed = String(body.prompt || body.text || '').trim().slice(0, 600);
    const mediaPart = buildMediaPart(body.media);
    const parts = [{
      text: `${seed ? `Draft idea/context: ${seed}\n` : ''}Write a punchy, authentic social post caption (1-2 sentences), 3-5 lowercase hashtags, and concise accessible altText. Return strictly JSON: {"caption":"...","hashtags":["tag1","tag2"],"altText":"..."}.`
    }];
    if (mediaPart) parts.push(mediaPart);
    return {
      wantsJson: true,
      wantsCaption: true,
      systemInstruction: {
        parts: [{
          text: 'You generate social post captions, clean hashtags (without # prefix), and accessible alt-text for WhatsGram OS. Respond strictly with valid JSON.'
        }]
      },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 280,
        responseMimeType: 'application/json'
      }
    };
  }

  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  const activeChat = body.activeChatName ? String(body.activeChatName).slice(0, 80) : null;
  const contextText = formatConversations(body.conversations);
  const wantsDraft = Boolean(body.wantDraft) ||
    /\b(draft|compose)\b/i.test(prompt) ||
    /\b(write|suggest|give me|prepare|craft)\s+(a\s+)?(quick\s+|short\s+|polite\s+|friendly\s+|formal\s+|casual\s+|professional\s+)?(reply|response|message|text|note)\b/i.test(prompt) ||
    /\breply\s+(to|back|for)\b/i.test(prompt) ||
    /\b(respond\s+to\s+(them|him|her|this|the\s+message|chat|conversation)|write\s+back)\b/i.test(prompt) ||
    /\b(rewrite|rephrase|polish|shorten|proofread)\s+(this|my\s+(draft|message|reply|text)|it)\b/i.test(prompt);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const mediaPart = buildMediaPart(body.media);
  const userParts = [{
    text: `[WhatsGram Inbox Context — use ONLY when the user asks about their chats, contacts, or drafting replies]\n${activeChat ? `Active open conversation: ${activeChat}\n\n` : ''}${contextText}\n\n[User Request]\n${prompt || (mediaPart ? 'Describe and analyze this attachment concisely.' : '')}`
  }];
  if (mediaPart) userParts.push(mediaPart);

  const contents = [
    ...history
      .filter(h => h && (h.role === 'user' || h.role === 'model') && h.text)
      .map(h => ({ role: h.role, parts: [{ text: String(h.text).slice(0, 3000) }] })),
    {
      role: 'user',
      parts: userParts
    }
  ];

  if (wantsDraft) {
    return {
      wantsJson: true,
      systemInstruction: {
        parts: [{
          text: 'You are WhatsGram AI, an intelligent general-purpose assistant and chat copilot inside WhatsGram OS (similar to Meta AI in WhatsApp). Help the user draft, reply, rewrite, translate, or write messages—grounded in their active conversation when replying to a contact, or using your full general knowledge for standalone requests. Respond strictly with valid JSON: {"answer": "<brief helpful note or summary>", "draft": "<ready-to-send message text, or null if no sendable draft was requested>"}. Do not wrap JSON in markdown fences.'
        }]
      },
      contents,
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 700,
        responseMimeType: 'application/json'
      }
    };
  }

  return {
    wantsJson: false,
    systemInstruction: {
      parts: [{
        text: 'You are WhatsGram AI, an all-purpose intelligent assistant inside WhatsGram OS (just like Meta AI in WhatsApp). Answer ALL general knowledge questions (science, biology, history, geography, technology, trivia, definitions), math, coding, explanations, translations, brainstorming, and writing tasks directly, accurately, and concisely using your full knowledge—never refuse general questions or force unrelated local chat messages into the answer. When the user asks about their WhatsGram chats, contacts, summaries, action items, or drafting replies, use the provided inbox context accurately without inventing messages. Format code using fenced markdown code blocks (```lang) and keep explanations crisp with **bold** highlights and clean bullet points.'
      }]
    },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 1024 }
  };
}

function buildUpstreamReqBody(model, payload) {
  const reqBody = {
    systemInstruction: payload.systemInstruction,
    contents: payload.contents,
    generationConfig: { ...payload.generationConfig }
  };
  if (model.startsWith('gemini-2.5')) {
    reqBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  return reqBody;
}

function classifyUpstreamError(status, errMsg) {
  const urlMatch = errMsg.match(/https:\/\/console\.[^\s"'<>]+/);
  const actionUrl = urlMatch ? urlMatch[0] : null;
  const code = status === 403 && /disabled|not been used/i.test(errMsg)
    ? 'API_DISABLED'
    : status === 401 || /api key not valid|invalid.*key/i.test(errMsg)
      ? 'INVALID_KEY'
      : status === 429
        ? 'RATE_LIMITED'
        : 'UPSTREAM_ERROR';
  return { code, actionUrl };
}

async function callModel(apiKey, model, payload) {
  const response = await fetch(getEndpoint(apiKey, model, false), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(buildUpstreamReqBody(model, payload))
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function streamModel(apiKey, initialModel, payload, res) {
  let model = initialModel;
  let response = await fetch(getEndpoint(apiKey, model, true), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(buildUpstreamReqBody(model, payload))
  });
  if (!response.ok && response.status === 404 && model !== FALLBACK_MODEL) {
    model = FALLBACK_MODEL;
    response = await fetch(getEndpoint(apiKey, model, true), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildUpstreamReqBody(model, payload))
    });
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `Gemini upstream error (${response.status})`;
    const { code, actionUrl } = classifyUpstreamError(response.status, errMsg);
    return res.status(response.status >= 400 && response.status < 600 ? response.status : 502).json({
      error: errMsg,
      code,
      ...(actionUrl ? { actionUrl } : {})
    });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.status(200);
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const provider = apiKey.startsWith('AQ.') ? 'vertex-express' : 'ai-studio';
  let fullText = '';
  let buf = '';
  const decoder = new TextDecoder();

  const emitChunk = delta => {
    if (!delta) return;
    fullText += delta;
    res.write(`event: chunk\ndata: ${JSON.stringify({ text: delta })}\n\n`);
  };

  const drainLines = (flushAll = false) => {
    const lines = buf.split(/\r?\n/);
    buf = flushAll ? '' : (lines.pop() || '');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = (parsed?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        emitChunk(delta);
      } catch {}
    }
  };

  try {
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        drainLines(false);
      }
    } else if (response.body) {
      for await (const chunk of response.body) {
        buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        drainLines(false);
      }
    }
    if (buf.trim()) drainLines(true);
    res.write(`event: done\ndata: ${JSON.stringify({
      text: fullText.trim(),
      draft: payload.isRewrite ? fullText.trim() : null,
      model,
      provider
    })}\n\n`);
    return res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message || 'Stream interrupted' })}\n\n`);
    return res.end();
  }
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
  const wantsStream = Boolean(body.stream) || String(req.headers?.accept || '').includes('text/event-stream');

  try {
    if (wantsStream && !payload.wantsJson) {
      return await streamModel(apiKey, DEFAULT_MODEL, payload, res);
    }

    let model = DEFAULT_MODEL;
    let result = await callModel(apiKey, model, payload);

    if (!result.ok && result.status === 404 && model !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      result = await callModel(apiKey, model, payload);
    }

    if (!result.ok) {
      const errMsg = result.data?.error?.message || `Gemini upstream error (${result.status})`;
      const { code, actionUrl } = classifyUpstreamError(result.status, errMsg);
      return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({
        error: errMsg,
        code,
        ...(actionUrl ? { actionUrl } : {})
      });
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
        if (payload.wantsCaption) {
          const caption = String(parsed.caption || rawText).trim();
          const hashtags = Array.isArray(parsed.hashtags)
            ? parsed.hashtags.map(h => String(h || '').replace(/^#+/, '').toLowerCase().trim()).filter(Boolean).slice(0, 8)
            : [];
          const altText = String(parsed.altText || '').trim();
          return res.status(200).json({ ok: true, caption, hashtags, altText, text: caption, model, provider });
        }
        const cleanDraft = parsed.draft && String(parsed.draft).trim().toLowerCase() !== 'null'
          ? String(parsed.draft).trim()
          : null;
        return res.status(200).json({
          text: String(parsed.answer || cleanDraft || rawText),
          draft: cleanDraft,
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
      draft: payload.isRewrite ? rawText : null,
      model,
      provider: apiKey.startsWith('AQ.') ? 'vertex-express' : 'ai-studio'
    });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Failed to reach Gemini API.' });
  }
};
