/* ترتيب إداري لأولوية المراجعة اعتمادًا على قواعد وصفية ثابتة؛ ليس تشخيصًا ولا تنبؤًا. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RafiqTriage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function triage(state, Core, now = new Date(), days = 14) {
    const p = state.profile, end = now.toISOString().slice(0, 10);
    const rs = Core.filterReadings(state.readings, { days, end });
    const st = Core.stats(rs, p);
    const reasons = []; let level = 'low';
    const important = rs.filter(r => r.mg < 54).length, veryHigh = rs.filter(r => r.mg >= 300).length;
    const lastAt = rs.length ? new Date(rs[0].at) : null, silent = lastAt ? Math.floor((now - lastAt) / 86400000) : null;
    if (important) { level = 'high'; reasons.push(`${important} قراءة أقل من 54`); }
    if (st.low >= 2) { level = 'high'; reasons.push(`${st.low} قراءات أقل من 70`); }
    if (veryHigh) { level = 'high'; reasons.push(`${veryHigh} قراءة 300 فأكثر`); }
    if (level !== 'high') {
      if (st.count < 5) { level = 'medium'; reasons.push('بيانات قليلة (أقل من 5 قراءات)'); }
      else if (st.ratio < 50) { level = 'medium'; reasons.push(`نسبة القراءات داخل النطاق ${st.ratio}%`); }
      if (silent !== null && silent >= 7) { level = 'medium'; reasons.push(`لا قراءات منذ ${silent} أيام`); }
      if (st.low === 1) { level = 'medium'; reasons.push('قراءة واحدة أقل من 70'); }
    }
    if (!reasons.length) reasons.push('لا مؤشرات مرتبة وفق القواعد');
    return { level, reasons, stats: st };
  }
  const ORDER = { high: 0, medium: 1, low: 2 };
  const sortPatients = list => [...list].sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.stats.low - a.stats.low);
  return { triage, sortPatients };
});
