const Storage = {
  // ── Internal: parse a word entry into { word, meanings[] } ─────────────
  _parse(e) {
    const word = (e.word || '').trim();
    if (!word) return null;

    let meanings = [];
    if (Array.isArray(e.meanings) && e.meanings.length) {
      meanings = e.meanings.map(m => String(m).trim()).filter(Boolean);
    } else if (e.definition) {
      // Support "def1; def2" or "def1 | def2" for multiple senses
      meanings = String(e.definition).split(/[;|]/).map(s => s.trim()).filter(Boolean);
    }
    return { word, meanings };
  },

  _dateKey(d) { return d.toISOString().slice(0, 10); }, // YYYY-MM-DD

  // ── Words ──────────────────────────────────────────────────────────────
  getWords() { return JSON.parse(localStorage.getItem('vm_words') || '[]'); },
  saveWords(words) { localStorage.setItem('vm_words', JSON.stringify(words)); },

  // Add words typed in the textarea ("word : def1; def2" format)
  addWords(rawEntries) {
    return this._insertWords(rawEntries, null);
  },

  // Add words from an import or word-book release
  addWordsFromImport(entries, wordBookId = null) {
    return this._insertWords(entries, wordBookId);
  },

  _insertWords(entries, wordBookId) {
    const words = this.getWords();
    const added = [];
    const existSet = new Set(words.map(w => w.word.toLowerCase()));

    for (const e of entries) {
      const parsed = this._parse(e);
      if (!parsed || !parsed.word) continue;
      if (existSet.has(parsed.word.toLowerCase())) continue;

      const obj = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        word: parsed.word,
        definition: parsed.meanings[0] || '',   // backward-compat field
        meanings: parsed.meanings,              // full meanings array
        dateAdded: new Date().toISOString(),
        sm2: SM2.initial(),
        wordBookId: wordBookId || null,
      };
      words.push(obj);
      added.push(obj);
      existSet.add(parsed.word.toLowerCase());
    }

    this.saveWords(words);
    return added;
  },

  updateWord(id, updates) {
    const words = this.getWords();
    const idx = words.findIndex(w => w.id === id);
    if (idx !== -1) { words[idx] = { ...words[idx], ...updates }; this.saveWords(words); }
  },

  deleteWord(id) { this.saveWords(this.getWords().filter(w => w.id !== id)); },

  getWordsDueToday() {
    const now = new Date();
    return this.getWords().filter(w => new Date(w.sm2.nextReview) <= now);
  },

  getWordsAddedToday() {
    const today = this._dateKey(new Date());
    return this.getWords().filter(w => w.dateAdded && w.dateAdded.startsWith(today));
  },

  // Group words by date added → Map<dateKey, Word[]>
  getWordsByDate() {
    const map = new Map();
    const words = [...this.getWords()].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    for (const w of words) {
      const key = w.dateAdded ? w.dateAdded.slice(0, 10) : 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(w);
    }
    return map;
  },

  // ── Check-ins ──────────────────────────────────────────────────────────
  getCheckIns() { return JSON.parse(localStorage.getItem('vm_checkins') || '[]'); },

  checkInToday() {
    const list = this.getCheckIns();
    const today = this._dateKey(new Date());
    if (list.includes(today)) return false;
    list.push(today);
    localStorage.setItem('vm_checkins', JSON.stringify(list));
    return true;
  },

  hasCheckedInToday() { return this.getCheckIns().includes(this._dateKey(new Date())); },

  getStreak() {
    const set = new Set(this.getCheckIns());
    let streak = 0;
    const d = new Date();
    while (set.has(this._dateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  },

  // ── Word Books ─────────────────────────────────────────────────────────
  getWordBooks() { return JSON.parse(localStorage.getItem('vm_wordbooks') || '[]'); },
  saveWordBooks(books) { localStorage.setItem('vm_wordbooks', JSON.stringify(books)); },

  addWordBook(book) {
    const books = this.getWordBooks();
    book.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    book.createdAt = new Date().toISOString();
    book.startDate = book.startDate || new Date().toISOString();
    book.releasedCount = 0;
    book.lastReleaseDate = null;
    book.active = true;
    books.push(book);
    this.saveWordBooks(books);
    return book;
  },

  updateWordBook(id, updates) {
    const books = this.getWordBooks();
    const idx = books.findIndex(b => b.id === id);
    if (idx !== -1) { books[idx] = { ...books[idx], ...updates }; this.saveWordBooks(books); }
  },

  deleteWordBook(id) {
    this.saveWordBooks(this.getWordBooks().filter(b => b.id !== id));
  },

  // Check all active word books and release today's batch of words into vm_words.
  // Returns total newly-released word count.
  releaseWordsForToday() {
    const books = this.getWordBooks();
    let totalReleased = 0;
    const today = this._dateKey(new Date());

    for (const book of books) {
      if (!book.active) continue;

      const start = new Date(book.startDate); start.setHours(0, 0, 0, 0);
      const now   = new Date();               now.setHours(0, 0, 0, 0);
      const daysSinceStart = Math.max(0, Math.round((now - start) / 86400000));

      // How many should have been released by end of today
      const shouldRelease = Math.min((daysSinceStart + 1) * book.dailyGoal, book.words.length);
      let toReleaseCount  = shouldRelease - (book.releasedCount || 0);

      if (toReleaseCount <= 0) continue;

      const pending = book.words.filter(w => w.status === 'pending');
      if (!pending.length) { book.active = false; continue; }

      const batch = pending.slice(0, toReleaseCount);
      this.addWordsFromImport(batch, book.id);

      batch.forEach(w => w.status = 'active');
      book.releasedCount = (book.releasedCount || 0) + batch.length;
      book.lastReleaseDate = today;
      totalReleased += batch.length;

      // Mark book complete if all words released
      if (book.releasedCount >= book.words.length) book.active = false;
    }

    if (totalReleased > 0) this.saveWordBooks(books);
    return totalReleased;
  },

  // How many new words were released from word books today
  getTodayReleased() {
    const today = this._dateKey(new Date());
    return this.getWordBooks()
      .filter(b => b.lastReleaseDate === today)
      .reduce((s, b) => s + b.dailyGoal, 0);
  },

  // ── Settings ───────────────────────────────────────────────────────────
  getSettings() { return JSON.parse(localStorage.getItem('vm_settings') || '{}'); },
  saveSettings(patch) {
    localStorage.setItem('vm_settings', JSON.stringify({ ...this.getSettings(), ...patch }));
  },

  // ── Export / Clear ─────────────────────────────────────────────────────
  exportAll() {
    return {
      words: this.getWords(),
      checkIns: this.getCheckIns(),
      wordBooks: this.getWordBooks(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
    };
  },
  clearAll() {
    ['vm_words', 'vm_checkins', 'vm_settings', 'vm_wordbooks'].forEach(k => localStorage.removeItem(k));
  },
};
