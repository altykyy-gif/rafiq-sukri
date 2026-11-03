/* مساعد استرجاع: يبحث في البطاقات الموثقة فقط؛ ليس نموذجًا لغويًا ولا يولّد معلومات جديدة. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RafiqAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STOP = new Set(['من', 'في', 'على', 'عن', 'الي', 'هل', 'ما', 'ماذا', 'كيف', 'متي', 'هذا', 'هذه', 'ان', 'او', 'مع', 'لا', 'انا', 'لي', 'هو', 'هي', 'كان', 'يكون']);
  const EMERGENCY = ['فقدان الوعي', 'فقد الوعي', 'اغماء', 'تشنج', 'لا يستجيب', 'غيبوبه', 'ضيق تنفس', 'الم في الصدر'];
  const DOSING = ['جرعه', 'جرعات', 'وحدات انسولين', 'كم وحده', 'كم حبه', 'اغير الدواء', 'ازيد الدواء'];
  const norm = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const stem = w => w.replace(/^(وال|بال|لل|ال|و)(?=.{3,})/, '');
  const tokens = s => norm(s).split(' ').map(stem).filter(w => w.length >= 3 && !STOP.has(w));
  function answer(question, cards, limit = 2) {
    const q = norm(question);
    if (q.length < 3) return { kind: 'empty', results: [] };
    if (EMERGENCY.some(k => q.includes(k))) return { kind: 'emergency', results: [] };
    if (DOSING.some(k => q.includes(k))) return { kind: 'dosing', results: [] };
    const qt = [...new Set(tokens(question))];
    const scored = cards.map(card => {
      const title = new Set(tokens(card.title)), meta = new Set(tokens(card.category + ' ' + card.intro)), body = new Set(tokens(card.body));
      let score = 0;
      for (const t of qt) score += title.has(t) ? 3 : meta.has(t) ? 2 : body.has(t) ? 1 : 0;
      return { card, score };
    }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit);
    return scored.length ? { kind: 'found', results: scored } : { kind: 'none', results: [] };
  }
  return { norm, tokens, answer };
});
