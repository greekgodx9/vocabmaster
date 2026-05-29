// SM-2 spaced repetition algorithm (Anki-style)
const SM2 = {
  initial() {
    return {
      interval: 0,       // days until next review
      repetitions: 0,    // successful reviews in a row
      easeFactor: 2.5,   // default EF
      nextReview: new Date().toISOString(),
    };
  },

  // quality: 0=again, 1=hard, 2=hard+, 3=good, 4=good+, 5=easy
  calculate(sm2, quality) {
    let { interval, repetitions, easeFactor } = sm2;

    if (quality >= 3) {
      if (repetitions === 0)      interval = 1;
      else if (repetitions === 1) interval = 6;
      else                        interval = Math.round(interval * easeFactor);
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1;
    }

    easeFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);
    nextReview.setHours(0, 0, 0, 0);

    return { interval, repetitions, easeFactor, nextReview: nextReview.toISOString() };
  },

  // Mastery level based on interval
  getStatus(sm2) {
    const { repetitions, interval } = sm2;
    if (repetitions === 0)   return 'new';
    if (interval < 7)        return 'learning';
    if (interval < 21)       return 'young';
    return 'mature';
  },

  // Next-review human label used on rate buttons
  nextLabel(quality, sm2) {
    const next = this.calculate(sm2, quality);
    const d = next.interval;
    if (d <= 1)  return '< 1 day';
    if (d < 7)   return `${d} days`;
    if (d < 30)  return `${Math.round(d / 7)} wk`;
    return `${Math.round(d / 30)} mo`;
  },
};
