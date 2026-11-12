const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatInline(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '`') {
      const end = raw.indexOf('`', i + 1);
      if (end !== -1) {
        out += `<code>${escHtml(raw.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    const nextTick = raw.indexOf('`', i);
    const seg = nextTick === -1 ? raw.slice(i) : raw.slice(i, nextTick);
    let safe = escHtml(seg);
    safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
    safe = safe.replace(/\*([^*\n]+)\*/g, '<em class="italic text-zinc-200">$1</em>');
    safe = safe.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-accent hover:brightness-110 break-all">$1</a>'
    );
    out += safe;
    if (nextTick === -1) break;
    i = nextTick;
  }
  return out;
}

function renderProseBlock(block) {
  const lines = block.replace(/\r/g, '').split('\n');
  let html = '';
  let listType = null;
  const closeList = () => {
    if (listType) {
      html += listType === 'ol' ? '</ol>' : '</ul>';
      listType = null;
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      html += `<p class="font-bold text-white text-[13.5px] mt-1">${formatInline(heading[2])}</p>`;
      continue;
    }
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html += '<ul>';
      }
      html += `<li>${formatInline(ul[1])}</li>`;
      continue;
    }
    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html += '<ol>';
      }
      html += `<li>${formatInline(ol[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${formatInline(line)}</p>`;
  }
  closeList();
  return html;
}

/**
 * Safely renders Gemini markdown (headings, lists, inline code, links, and fenced ```lang code blocks).
 */
export function renderAiMarkdown(rawText) {
  const src = String(rawText ?? '');
  if (!src.trim()) return '';
  const parts = [];
  let idx = 0;
  while (idx < src.length) {
    const start = src.indexOf('```', idx);
    if (start === -1) {
      parts.push({ type: 'prose', text: src.slice(idx) });
      break;
    }
    if (start > idx) {
      parts.push({ type: 'prose', text: src.slice(idx, start) });
    }
    const nl = src.indexOf('\n', start + 3);
    const lang = nl === -1 ? '' : src.slice(start + 3, nl).trim().replace(/[^a-zA-Z0-9_+#.-]/g, '');
    const bodyStart = nl === -1 ? start + 3 : nl + 1;
    const close = src.indexOf('```', bodyStart);
    if (close === -1) {
      parts.push({ type: 'code', lang: lang || 'code', code: src.slice(bodyStart), streaming: true });
      break;
    }
    parts.push({ type: 'code', lang: lang || 'code', code: src.slice(bodyStart, close).replace(/\n$/, ''), streaming: false });
    idx = close + 3;
  }

  return `<div class="ai-md">${parts
    .map((part) => {
      if (part.type === 'prose') return renderProseBlock(part.text);
      const label = escHtml(part.lang || 'code');
      const rawCode = part.code || '';
      const code = escHtml(rawCode);
      const splitLines = rawCode ? rawCode.split('\n') : [];
      const meta = splitLines.length ? `${label} · ${splitLines.length} line${splitLines.length === 1 ? '' : 's'}` : label;
      const linedHtml = splitLines.length
        ? splitLines.map((ln, idx) => `<span class="ai-ln"><span class="ai-ln-num">${idx + 1}</span><span>${escHtml(ln) || ' '}</span></span>`).join('')
        : code;
      return `<div class="ai-code-wrap"><div class="ai-code-head"><span>${meta}</span><div class="flex items-center gap-1.5"><button type="button" class="ai-ln-btn px-1.5 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.14] text-[10px] font-semibold text-zinc-300 transition" title="Toggle line numbers">#</button><button type="button" class="ai-copy-btn px-2 py-0.5 rounded-md bg-white/[0.07] hover:bg-white/[0.15] text-[10px] font-semibold text-zinc-200 transition" data-copy-code="${code}">Copy</button></div></div><pre class="has-ln"><code data-raw="${code}" data-lined="${escHtml(linedHtml)}">${linedHtml}</code></pre></div>`;
    })
    .join('')}</div>`;
}

export function bindMarkdownCopy(container, onCopied) {
  if (!container || container.dataset.copyBound) return;
  container.dataset.copyBound = '1';
  container.addEventListener('click', (e) => {
    const lnBtn = e.target.closest('.ai-ln-btn');
    if (lnBtn) {
      const wrap = lnBtn.closest('.ai-code-wrap');
      const pre = wrap?.querySelector('pre');
      const codeEl = pre?.querySelector('code');
      if (pre && codeEl) {
        const useLn = !pre.classList.contains('has-ln');
        pre.classList.toggle('has-ln', useLn);
        codeEl.innerHTML = useLn ? (codeEl.dataset.lined || escHtml(codeEl.textContent)) : (codeEl.dataset.raw || escHtml(codeEl.textContent));
      }
      return;
    }
    const btn = e.target.closest('.ai-copy-btn');
    if (!btn) return;
    const pre = btn.closest('.ai-code-wrap')?.querySelector('pre code');
    let txt = '';
    if (pre) {
      const spans = pre.querySelectorAll('.ai-ln > span:last-child');
      txt = spans.length ? [...spans].map(s => s.textContent === ' ' ? '' : s.textContent).join('\n') : (pre.textContent || '');
    }
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => {
      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      onCopied && onCopied();
      setTimeout(() => {
        btn.textContent = prev || 'Copy';
        btn.classList.remove('copied');
      }, 1400);
    }).catch(() => {});
  });
}
