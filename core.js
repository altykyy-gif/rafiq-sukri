/* Rafiq Diabetes 1.0.0 — deterministic, descriptive calculations only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RafiqCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const CONTEXTS = Object.freeze({ fasting: 'صائم', before: 'قبل الوجبة', after: 'بعد بداية الوجبة بساعة إلى ساعتين', bedtime: 'قبل النوم', random: 'وقت آخر' });
  const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const clone = x => JSON.parse(JSON.stringify(x));
  function number(value) {
    const text = String(value ?? '').trim().replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 1776)).replace(/٫/g, '.').replace(/٬/g, '').replace(',', '.');
    return text !== '' && /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  }
  const toMg = (value, unit = 'mg') => Number((Number(value) * (unit === 'mmol' ? 18 : 1)).toFixed(2));
  const fromMg = (value, unit = 'mg') => Number((Number(value) / (unit === 'mmol' ? 18 : 1)).toFixed(unit === 'mmol' ? 1 : 0));
  function dayKey(date = new Date()) {
    const d = new Date(date);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function localInput(date = new Date()) {
    const d = new Date(date);
    return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function defaultState() {
    return { schemaVersion: 1, profile: { name: '', unit: 'mg', type: 'unspecified', beforeLow: 80, beforeHigh: 130, afterHigh: 180, chartLow: 70, chartHigh: 180, targetsConfirmed: false, emergencyPhone: '', largeText: false }, readings: [], labs: [], medications: [], doseLog: {}, habits: {}, visits: [], questions: '', updatedAt: new Date().toISOString() };
  }
  function validateReading(input, existingId) {
    const raw = number(input.value);
    const mg = toMg(raw, input.unit);
    if (!Number.isFinite(mg) || mg < 1 || mg > 1000) throw new Error('أدخل قراءة رقمية بين 1 و1000 ملغ/دل أو ما يعادلها. إذا عرض الجهاز HI أو LO فاتبع تعليماته وخطتك الطبية.');
    const date = new Date(input.at);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000) throw new Error('اختر وقتًا صحيحًا؛ لا يمكن تسجيل قراءة في المستقبل.');
    if (!Object.hasOwn(CONTEXTS, input.context)) throw new Error('حدد توقيت القراءة بالنسبة إلى الوجبة.');
    return { id: existingId || id(), mg, at: date.toISOString(), context: input.context, note: String(input.note || '').trim().slice(0, 1000), symptoms: String(input.symptoms || '').slice(0, 100), updatedAt: new Date().toISOString() };
  }
  function classify(r, p) {
    if (r.mg < 54) return { key: 'low-important', tone: 'danger', label: 'هبوط مهم — تصرّف فورًا' };
    if (r.mg < 70) return { key: 'low', tone: 'danger', label: 'قراءة منخفضة' };
    if (r.mg >= 300) return { key: 'very-high', tone: 'danger', label: 'قراءة مرتفعة جدًا' };
    if (r.context === 'fasting' || r.context === 'before') {
      if (r.mg < p.beforeLow) return { key: 'below', tone: 'gold', label: 'أقل من هدف قبل الوجبة' };
      return r.mg <= p.beforeHigh ? { key: 'within', tone: 'teal', label: 'ضمن هدف قبل الوجبة' } : { key: 'above', tone: 'gold', label: 'فوق هدف قبل الوجبة' };
    }
    if (r.context === 'after') return r.mg < p.afterHigh ? { key: 'within', tone: 'teal', label: 'دون الحد المحدد بعد الوجبة' } : { key: 'above', tone: 'gold', label: 'عند حد بعد الوجبة أو فوقه' };
    return { key: 'context', tone: 'neutral', label: 'قراءة مسجلة — بلا هدف لهذا التوقيت' };
  }
  function filterReadings(readings, options = {}) {
    const end = options.end ? new Date(`${options.end}T23:59:59.999`) : new Date();
    let start;
    if (options.start) start = new Date(`${options.start}T00:00:00`);
    else { start = new Date(end); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (Number(options.days || 14) - 1)); }
    return readings.filter(r => { const t = new Date(r.at); return t >= start && t <= end && (!options.context || options.context === 'all' || r.context === options.context); }).sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  function stats(readings, profile) {
    const values = readings.map(r => r.mg);
    const count = values.length;
    const inside = values.filter(v => v >= profile.chartLow && v <= profile.chartHigh).length;
    return { count, mean: count ? values.reduce((a, b) => a + b, 0) / count : null, min: count ? Math.min(...values) : null, max: count ? Math.max(...values) : null, low: values.filter(v => v < 70).length, inside, ratio: count ? Math.round(inside * 100 / count) : null, days: new Set(readings.map(r => dayKey(r.at))).size };
  }
  function insights(state) {
    const latest = filterReadings(state.readings, { days: 7 });
    const all30 = filterReadings(state.readings, { days: 30 });
    const summaries = [];
    const low = all30.filter(r => r.mg < 70).length;
    if (low) summaries.push({ tone: 'danger', title: `${low} قراءات منخفضة خلال 30 يومًا`, text: 'اعرض توقيتها والأعراض المصاحبة على فريقك الطبي لمراجعة الخطة. لا يحدد هذا السجل سبب الهبوط.', icon: 'shield' });
    else summaries.push({ tone: 'teal', title: 'السياق يجعل القراءة أوضح', text: 'أضف توقيت الوجبة والأعراض والملاحظات؛ ليس مطلوبًا أن تكون الأرقام مثالية لتكون المتابعة مفيدة.', icon: 'note' });
    const end = new Date(); end.setDate(end.getDate() - 7);
    const prev = filterReadings(state.readings, { days: 7, end: dayKey(end) });
    if (latest.length >= 3 && prev.length >= 3) {
      const delta = stats(latest, state.profile).mean - stats(prev, state.profile).mean;
      summaries.push({ tone: 'neutral', title: 'مقارنة وصفية بين أسبوعين', text: `متوسط آخر 7 أيام ${delta >= 0 ? 'أعلى' : 'أقل'} بمقدار ${fromMg(Math.abs(delta), state.profile.unit)} ${state.profile.unit === 'mmol' ? 'ملمول/لتر' : 'ملغ/دل'} من الأيام السبعة السابقة. اختلاف مواعيد القياس يؤثر في المقارنة.`, icon: 'chart' });
    } else summaries.push({ tone: 'gold', title: 'نمط أوضح مع الوقت', text: 'تظهر مقارنة أسبوعين عندما تتوفر 3 قراءات مسجلة على الأقل في كل أسبوع؛ هي وصف للأرقام، وليست تقييمًا للعلاج.', icon: 'chart' });
    summaries.push({ tone: 'teal', title: `${new Set(latest.map(r => dayKey(r.at))).size} أيام لها قراءات في هذا الأسبوع`, text: 'يمثل هذا أيام التسجيل فقط. عدد القياسات وتوقيتها يحددهما فريقك الطبي، ولا نستنتج منهما التزامك بالعلاج.', icon: 'calendar' });
    return summaries;
  }
  function safeText(value, max = 1000) { return typeof value === 'string' ? value.slice(0, max) : ''; }
  function validateBackup(raw) {
    if (raw?.demo === true) throw new Error('هذه نسخة عرض تجريبي ببيانات افتراضية؛ لا يمكن استعادتها كسجل مريض.');
    const source = raw?.app === 'rafiq-diabetes' && raw.data ? raw.data : raw;
    if (!source || source.schemaVersion !== 1 || !Array.isArray(source.readings) || !Array.isArray(source.medications) || !Array.isArray(source.visits) || !Array.isArray(source.labs)) throw new Error('هذه ليست نسخة احتياطية متوافقة مع رفيق السكري.');
    if ([source.readings, source.medications, source.visits, source.labs].some(a => a.length > 50000)) throw new Error('النسخة تتجاوز الحد المدعوم للسجلات.');
    const out = defaultState();
    if (!source.profile || !['mg', 'mmol'].includes(source.profile.unit)) throw new Error('وحدة القياس في النسخة غير صالحة.');
    const p = source.profile;
    for (const key of ['beforeLow', 'beforeHigh', 'afterHigh', 'chartLow', 'chartHigh']) if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) throw new Error('الأهداف في النسخة غير صالحة.');
    if (p.beforeLow < 70 || p.beforeHigh <= p.beforeLow || p.beforeHigh > 400 || p.afterHigh < 80 || p.afterHigh > 500 || p.chartLow < 70 || p.chartHigh <= p.chartLow || p.chartHigh > 600) throw new Error('حدود الأهداف في النسخة غير صالحة.');
    out.profile = { ...out.profile, name: safeText(p.name, 60), unit: p.unit, type: ['type1', 'type2', 'other', 'unspecified'].includes(p.type) ? p.type : 'unspecified', beforeLow: p.beforeLow, beforeHigh: p.beforeHigh, afterHigh: p.afterHigh, chartLow: p.chartLow, chartHigh: p.chartHigh, targetsConfirmed: p.targetsConfirmed === true, emergencyPhone: safeText(p.emergencyPhone, 25).replace(/[^\d+() -]/g, ''), largeText: p.largeText === true };
    const validAt = at => typeof at === 'string' && Number.isFinite(new Date(at).getTime()) && new Date(at).getTime() <= Date.now() + 300000;
    const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const seen = new Set();
    out.readings = source.readings.map(r => {
      if (!r || !validId(r.id) || seen.has(r.id) || !validAt(r.at) || typeof r.mg !== 'number' || !Number.isFinite(r.mg) || r.mg < 1 || r.mg > 1000 || !Object.hasOwn(CONTEXTS, r.context)) throw new Error('تحتوي النسخة على قراءة تالفة أو مكررة.');
      seen.add(r.id); return { id: r.id, mg: r.mg, at: new Date(r.at).toISOString(), context: r.context, note: safeText(r.note), symptoms: safeText(r.symptoms, 100), updatedAt: validAt(r.updatedAt) ? r.updatedAt : r.at };
    });
    out.medications = source.medications.map(m => {
      if (!m || !validId(m.id) || !safeText(m.name, 80) || !Array.isArray(m.times) || !m.times.length || m.times.length > 8 || m.times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('يحتوي جدول الدواء على بيانات غير صالحة.');
      return { id: m.id, name: safeText(m.name, 80), dose: safeText(m.dose, 100), note: safeText(m.note, 200), times: [...new Set(m.times)].sort() };
    });
    out.labs = source.labs.map(l => {
      if (!l || !validId(l.id) || !validAt(l.at) || !['a1c', 'weight'].includes(l.kind) || typeof l.value !== 'number' || !Number.isFinite(l.value) || l.value <= 0 || l.value > (l.kind === 'a1c' ? 25 : 500)) throw new Error('تحتوي الفحوص على بيانات غير صالحة.');
      return { id: l.id, kind: l.kind, value: l.value, at: l.at, note: safeText(l.note, 500) };
    });
    out.visits = source.visits.map(v => {
      if (!v || !validId(v.id) || !Number.isFinite(new Date(v.at).getTime()) || !safeText(v.title, 100)) throw new Error('يحتوي سجل المواعيد على بيانات غير صالحة.');
      return { id: v.id, title: safeText(v.title, 100), at: new Date(v.at).toISOString(), place: safeText(v.place, 150), note: safeText(v.note, 500) };
    });
    for (const list of [out.medications, out.labs, out.visits]) if (new Set(list.map(x => x.id)).size !== list.length) throw new Error('تحتوي النسخة على سجلات مكررة بمعرّفات متطابقة.');
    for (const [key, value] of Object.entries(source.doseLog || {})) if (/^[a-zA-Z0-9_-]+\|\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/.test(key) && value === true) out.doseLog[key] = true;
    for (const [date, values] of Object.entries(source.habits || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(values)) out.habits[date] = values.filter(v => ['food', 'activity', 'feet', 'plan'].includes(v));
    out.questions = safeText(source.questions, 5000); out.updatedAt = new Date().toISOString();
    return out;
  }
  function csvCell(value) { let s = String(value ?? ''); if (/^[\s\uFEFF]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function csv(readings, unit, demo = false) {
    const lines = [['التاريخ والوقت المحلي', 'القراءة', 'الوحدة', 'التوقيت', 'الأعراض', 'الملاحظة']];
    readings.forEach(r => lines.push([localInput(r.at).replace('T', ' '), fromMg(r.mg, unit), unit === 'mmol' ? 'mmol/L' : 'mg/dL', CONTEXTS[r.context], r.symptoms, r.note]));
    if (demo) lines.forEach((row, i) => row.unshift(i === 0 ? 'نوع البيانات' : 'بيانات افتراضية للعرض، ليست سجل مريض'));
    return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n');
  }
  function demoState() {
    const s = defaultState(); s.profile.name = 'العرض التجريبي';
    const values = [132, 166, 118, 155, 142, 183, 121, 159, 108, 151, 116, 146, 129, 174, 112, 148, 124, 162, 119, 153, 127, 173, 115, 144, 122, 158, 117, 149];
    for (let d = 13; d >= 0; d--) for (let slot = 0; slot < 2; slot++) {
      const at = new Date(); at.setDate(at.getDate() - d); at.setHours(slot ? 13 : 8, 15, 0, 0);
      if (at > new Date()) at.setTime(Date.now() - (slot ? 5 : 65) * 60000);
      s.readings.push({ id: `demo-${d}-${slot}`, at: at.toISOString(), mg: values[(13 - d) * 2 + slot], context: slot ? 'after' : 'fasting', note: 'بيانات افتراضية لشرح الواجهة فقط', symptoms: '', updatedAt: at.toISOString() });
    }
    s.medications = [{ id: 'demo-med', name: 'دواء توضيحي', dose: 'وفق وصفة الطبيب', times: ['08:00', '20:00'], note: 'اسم افتراضي، ليس اقتراحًا لدواء' }];
    s.labs = [{ id: 'demo-lab', kind: 'a1c', value: 7.2, at: new Date(Date.now() - 86400000 * 21).toISOString(), note: 'نتيجة افتراضية' }];
    s.visits = [{ id: 'demo-visit', title: 'متابعة مع الفريق الطبي', at: new Date(Date.now() + 86400000 * 5).toISOString(), place: 'العيادة — مثال توضيحي', note: '' }];
    return s;
  }
  return { VERSION, CONTEXTS, id, clone, number, toMg, fromMg, dayKey, localInput, defaultState, validateReading, classify, filterReadings, stats, insights, validateBackup, csv, demoState };
});
