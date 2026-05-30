const API = {
  // ── Provider config ────────────────────────────────────────────────────
  PROVIDERS: {
    anthropic: {
      label: 'Claude (Anthropic)',
      needsModel: false,
      needsUrl:   false,
      defaultModel: 'claude-sonnet-4-6',
    },
    openai: {
      label: 'OpenAI (GPT-4o)',
      needsModel: false,
      needsUrl:   false,
      defaultModel: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
    },
    deepseek: {
      label: 'DeepSeek',
      needsModel: true,
      needsUrl:   false,
      defaultModel: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      modelHint: 'deepseek-chat 或 deepseek-reasoner',
    },
    doubao: {
      label: '豆包 Doubao (火山方舟)',
      needsModel: true,
      needsUrl:   false,
      defaultModel: '',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      modelHint: '你的 Endpoint ID，如 ep-20240611090408-xxxxx',
    },
    qwen: {
      label: '通义千问 Qwen (阿里云)',
      needsModel: true,
      needsUrl:   false,
      defaultModel: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      modelHint: 'qwen-plus / qwen-turbo / qwen-max',
    },
    zhipu: {
      label: '智谱 GLM (Zhipu AI)',
      needsModel: true,
      needsUrl:   false,
      defaultModel: 'glm-4-flash',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      modelHint: 'glm-4-flash / glm-4-plus / glm-4',
    },
    kimi: {
      label: 'Kimi (Moonshot AI)',
      needsModel: true,
      needsUrl:   false,
      defaultModel: 'moonshot-v1-8k',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
      modelHint: 'moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k',
    },
    custom: {
      label: '自定义 Custom (OpenAI 兼容)',
      needsModel: true,
      needsUrl:   true,
      defaultModel: '',
      modelHint: '模型名称，如 gpt-4o、deepseek-chat …',
      urlHint:   'https://your-api.com/v1/chat/completions',
    },
  },

  // ── Prompt builder ─────────────────────────────────────────────────────
  LEVEL_PROMPTS: {
    b1:   'B1-B2 Intermediate / Everyday English — clear, accessible, welcoming to learners',
    cet6: 'CET-6 (College English Test Band 6)',
    ielts: 'IELTS Band 7-8 / Graduate-level English',
    gre:  'GRE / Advanced Academic English',
  },

  buildPrompt(words, { length, level, topic }) {
    const levelDesc = this.LEVEL_PROMPTS[level] || this.LEVEL_PROMPTS.ielts;
    const topicLine = topic ? `Topic: ${topic}` : 'Choose a thought-provoking, intellectually stimulating topic of your choice.';

    // Build word list — show all senses for multi-meaning words
    let hasMultiMeaning = false;
    const wordList = words.map(w => {
      const meanings = (w.meanings && w.meanings.length) ? w.meanings : (w.definition ? [w.definition] : []);
      if (meanings.length === 0) return `- ${w.word}`;
      if (meanings.length === 1) return `- ${w.word}: ${meanings[0]}`;
      hasMultiMeaning = true;
      const senses = meanings.map((m, i) => `${i + 1}) ${m}`).join('; ');
      return `- ${w.word} ⟨multiple senses⟩ ${senses}`;
    }).join('\n');

    const multiNote = hasMultiMeaning ? `
Polysemy note: Words marked ⟨multiple senses⟩ are common words with less-obvious meanings. For these words, DELIBERATELY choose a less familiar sense (e.g., use "sanction" to mean "to penalise" not just "to approve", or "bank" as a verb meaning to tilt). This is the "熟词生义" technique — encountering familiar words in unexpected usage is one of the most powerful ways to deepen vocabulary.` : '';

    return `You are a seasoned journalist and essayist writing for The Atlantic, Nature, or The New Yorker. Your prose is elegant, logically structured, and a pleasure to read.

Write an article of approximately ${length} words at ${levelDesc} level. You MUST use ALL of these vocabulary words naturally in the text:

${wordList}

${topicLine}${multiNote}

WRITING GUIDELINES:
- OPEN with a compelling hook — an anecdote, a provocative question, or a striking fact.
- STRUCTURE clearly: introduction → body (2-3 paragraphs with logical transitions) → a thoughtful conclusion that ties back to the opening.
- FLOW naturally: each paragraph must connect to the next. Use transitions like "Yet...", "What this reveals is...", "Consider, for instance...", "This raises a deeper question..."
- Avoid listing facts — weave them into a narrative with cause and effect, tension and resolution.
- Every target word should feel organically placed. The reader should not notice they are vocabulary words.
- Vary sentence length and rhythm. Mix short, punchy sentences with longer, more complex ones.

TECHNICAL REQUIREMENTS:
1. First line: a compelling title. Then one blank line. Then the article body.
2. Wrap EVERY target word in [[double brackets]] — the exact word form that appears in the text.
3. Return ONLY the article (title + body). No explanations, no word counts, no meta-commentary.`;
  },

  // ── Main entry point ───────────────────────────────────────────────────
  async generateArticle(words, { length, level, topic }) {
    const s = Storage.getSettings();
    const { apiKey, apiProvider, apiModel, customUrl } = s;

    if (!apiKey) throw new Error('未设置 API Key。请点击左下角 Settings 填入 API Key。');

    const provider = apiProvider || 'deepseek';
    const prompt   = this.buildPrompt(words, { length, level, topic });
    const cfg      = this.PROVIDERS[provider];

    if (!cfg) throw new Error(`未知的 provider: ${provider}`);

    if (provider === 'anthropic') {
      return this._callAnthropic(prompt, apiKey);
    }

    // All other providers use OpenAI-compatible format
    const model = apiModel || cfg.defaultModel;
    if (!model) throw new Error(`请在 Settings 中填写 Model / Endpoint ID（${cfg.label}）`);

    const url = provider === 'custom' ? customUrl : cfg.baseUrl;
    if (!url) throw new Error('请在 Settings 中填写 API URL');

    return this._callOpenAICompat(prompt, apiKey, model, url);
  },

  // ── Anthropic ──────────────────────────────────────────────────────────
  async _callAnthropic(prompt, apiKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Anthropic ${res.status}: ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();
    return data.content[0].text;
  },

  // ── OpenAI-compatible (covers all other providers) ─────────────────────
  async _callOpenAICompat(prompt, apiKey, model, baseUrl) {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || err.message || res.statusText;
      throw new Error(`API 错误 ${res.status}: ${msg}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  },

  // ── Parse AI response → { title, html, targetWords } ──────────────────
  // wordStatusMap: { 'word_lowercase': 'mark-new' | 'mark-due' | 'mark-review' }
  parseArticle(raw, words, wordStatusMap = null) {
    const lines   = raw.trim().split('\n');
    const title   = lines[0].replace(/^#+\s*/, '').trim();
    const bodyRaw = lines.slice(1).join('\n').trim();

    const found = new Set();
    const body  = bodyRaw.replace(/\[\[([^\]]+)\]\]/g, (_, w) => {
      found.add(w.toLowerCase());
      const cls     = wordStatusMap ? (wordStatusMap[w.toLowerCase()] || 'mark-review') : 'mark-review';
      const safeAttr = w.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `<mark class="${cls}" data-word="${safeAttr}">${w}</mark>`;
    });

    const html = body
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/\n/g, ' ')}</p>`)
      .join('');

    const targetWords = words.filter(w => found.has(w.word.toLowerCase()));
    return { title, html, targetWords };
  },

  // ── Free Dictionary API (no key needed) ───────────────────────────────
  async fetchDictionary(word) {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) return null;
      const entry = data[0];

      const phonetic = entry.phonetics?.find(p => p.text)?.text || entry.phonetic || '';
      const richMeanings = [];
      const examples = [];

      for (const m of entry.meanings || []) {
        for (const d of m.definitions || []) {
          richMeanings.push({ pos: m.partOfSpeech, definition: d.definition, example: d.example || '' });
          if (d.example) examples.push(d.example);
        }
      }

      return {
        phonetic,
        richMeanings: richMeanings.slice(0, 4),
        examples: examples.slice(0, 2),
        meanings: richMeanings.slice(0, 3).map(m => `(${m.pos}) ${m.definition}`),
      };
    } catch { return null; }
  },
};
