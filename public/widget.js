/*
 * AI チャット欄（埋め込み用）
 *
 * 使い方:
 *   <script src="https://<api>/widget.js" data-widget-key="pk_xxx" defer></script>
 *
 * 任意の属性:
 *   data-api-base  API の URL（省略時はこのスクリプトの配信元）
 *   data-title     ヘッダーの表示名
 *   data-greeting  最初に表示するあいさつ
 *   data-color     テーマカラー（例: #c2185b）
 */
(() => {
  const script = document.currentScript;
  if (!script) return;

  const key = script.dataset.widgetKey;
  if (!key) {
    console.error('[ai-chat] data-widget-key is required');
    return;
  }
  const apiBase = (script.dataset.apiBase || new URL(script.src).origin).replace(/\/$/, '');
  const title = script.dataset.title || 'AIチャット';
  const greeting =
    script.dataset.greeting || 'こんにちは！ご予約や施術についてお気軽にご質問ください。';
  const color = script.dataset.color || '#2563eb';
  const storageKey = `ai-chat:${key}:conversationId`;

  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
      .launcher {
        position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
        width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
        background: ${color}; color: #fff; box-shadow: 0 6px 20px rgba(0,0,0,.25);
        display: grid; place-items: center;
      }
      .launcher svg { width: 28px; height: 28px; }
      .panel {
        position: fixed; right: 20px; bottom: 92px; z-index: 2147483000;
        width: min(370px, calc(100vw - 32px)); height: min(560px, calc(100vh - 120px));
        background: #fff; color: #1f2937; border-radius: 16px; overflow: hidden;
        box-shadow: 0 12px 40px rgba(0,0,0,.25); display: none; flex-direction: column;
      }
      .panel.open { display: flex; }
      header {
        background: ${color}; color: #fff; padding: 14px 16px; font-weight: 600; font-size: 15px;
        display: flex; align-items: center; justify-content: space-between;
      }
      header button { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
      .log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }
      .msg { max-width: 85%; padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
      .bot { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; }
      .user { align-self: flex-end; background: ${color}; color: #fff; }
      .fallback { border-color: #f59e0b; background: #fffbeb; }
      .meta { font-size: 12px; color: #6b7280; margin-top: 6px; }
      .meta a { color: ${color}; font-weight: 600; }
      .typing { color: #6b7280; font-style: italic; }
      form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e5e7eb; background: #fff; }
      textarea {
        flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 10px;
        font-size: 14px; line-height: 1.4; max-height: 96px; outline-color: ${color};
      }
      .send { background: ${color}; color: #fff; border: none; border-radius: 10px; padding: 0 14px; font-weight: 600; cursor: pointer; }
      .send:disabled { opacity: .5; cursor: default; }
      .note { font-size: 11px; color: #9ca3af; text-align: center; padding: 0 12px 8px; background: #fff; }
      @media (max-width: 480px) {
        .panel { right: 16px; bottom: 88px; }
      }
    </style>
    <button class="launcher" aria-label="${title}を開く">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
    <section class="panel" role="dialog" aria-label="${title}">
      <header><span>${title}</span><button class="close" aria-label="閉じる">×</button></header>
      <div class="log" aria-live="polite"></div>
      <form>
        <textarea rows="1" placeholder="ご質問を入力してください" maxlength="1000"></textarea>
        <button class="send" type="submit">送信</button>
      </form>
      <div class="note">AIが自動で回答します。内容によっては担当者へおつなぎします。</div>
    </section>
  `;
  document.body.appendChild(host);

  const panel = root.querySelector('.panel');
  const log = root.querySelector('.log');
  const form = root.querySelector('form');
  const input = root.querySelector('textarea');
  const sendButton = root.querySelector('.send');

  const toggle = (open) => {
    panel.classList.toggle('open', open);
    if (open) input.focus();
  };
  root.querySelector('.launcher').addEventListener('click', () =>
    toggle(!panel.classList.contains('open')),
  );
  root.querySelector('.close').addEventListener('click', () => toggle(false));

  const readConversationId = () => {
    try { return sessionStorage.getItem(storageKey) || undefined; } catch { return undefined; }
  };
  const saveConversationId = (id) => {
    try { sessionStorage.setItem(storageKey, id); } catch { /* 保存できなくても会話は続けられる */ }
  };

  const addMessage = (role, text, extra) => {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = text;
    if (extra) el.appendChild(extra);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  addMessage('bot', greeting);

  const send = async (text) => {
    addMessage('user', text);
    const typing = addMessage('bot typing', '入力中…');
    sendButton.disabled = true;
    try {
      const post = (conversationId) =>
        fetch(`${apiBase}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': key },
          body: JSON.stringify({ message: text, conversationId }),
        });
      const conversationId = readConversationId();
      let res = await post(conversationId);
      // 保存していた会話が見つからない（DB をリセットした等）ときは新しい会話でやり直す
      if (res.status === 404 && conversationId) res = await post(undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      saveConversationId(data.conversationId);
      typing.remove();

      const meta = document.createElement('div');
      meta.className = 'meta';
      if (data.status === 'fallback' && data.fallback?.contactUrl) {
        const link = document.createElement('a');
        link.href = data.fallback.contactUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'お問い合わせフォームへ';
        meta.appendChild(link);
      } else if (data.sources?.length) {
        meta.textContent = `参照: ${data.sources.map((s) => s.title).join(' / ')}`;
      }
      const el = addMessage('bot', data.answer, meta.childNodes.length ? meta : undefined);
      if (data.status === 'fallback') el.classList.add('fallback');
    } catch (error) {
      typing.remove();
      addMessage('bot fallback', '通信エラーが発生しました。時間をおいて再度お試しください。');
      console.error('[ai-chat]', error);
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || sendButton.disabled) return;
    input.value = '';
    send(text);
  });
  input.addEventListener('keydown', (event) => {
    // 日本語入力の変換確定の Enter では送信しない
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
})();
