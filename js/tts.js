const TTS = {
  synth: window.speechSynthesis,
  utterance: null,
  paused: false,
  onEnd: null,

  // Populate voice selector
  populateVoices(selectEl) {
    const fill = () => {
      const voices = this.synth.getVoices().filter(v => v.lang.startsWith('en'));
      selectEl.innerHTML = '';
      if (!voices.length) {
        selectEl.innerHTML = '<option>Default</option>';
        return;
      }
      voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})`;
        selectEl.appendChild(opt);
      });
    };
    fill();
    this.synth.addEventListener('voiceschanged', fill);
  },

  // Get plain text from article HTML (strips tags, expands marks)
  extractText(htmlStr) {
    const tmp = document.createElement('div');
    tmp.innerHTML = htmlStr;
    return tmp.textContent || tmp.innerText || '';
  },

  speak(text, { rate = 1, voiceIndex = null, onStart, onEnd, onPause } = {}) {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;

    const voices = this.synth.getVoices().filter(v => v.lang.startsWith('en'));
    if (voiceIndex !== null && voices[voiceIndex]) {
      utterance.voice = voices[voiceIndex];
    }

    utterance.onstart  = onStart || null;
    utterance.onend    = () => { this.paused = false; if (onEnd) onEnd(); };
    utterance.onerror  = (e) => { if (e.error !== 'interrupted') console.warn('TTS error', e); };

    this.utterance = utterance;
    this.paused = false;
    this.synth.speak(utterance);
  },

  pause() {
    if (this.synth.speaking && !this.paused) {
      this.synth.pause();
      this.paused = true;
    }
  },

  resume() {
    if (this.paused) {
      this.synth.resume();
      this.paused = false;
    }
  },

  stop() {
    this.synth.cancel();
    this.paused = false;
    this.utterance = null;
  },

  isSpeaking() { return this.synth.speaking; },
  isPaused()   { return this.paused; },
};
