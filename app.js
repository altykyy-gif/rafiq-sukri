(async function () {
  'use strict';
  const C = RafiqCore, D = RafiqContent;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${D.icons[name] || D.icons.info}</svg>`;
  const unitLabel = () => S().profile.unit === 'mmol' ? 'mmol/L' : 'mg/dL';
  const unitAr = () => S().profile.unit === 'mmol' ? 'ملمول/لتر' : 'ملغ/دل';
  const val = mg => mg === null || mg === undefined ? '—' : C.fromMg(mg, S().profile.unit).toLocaleString('en-US', { maximumFractionDigits: S().profile.unit === 'mmol' ? 1 : 0 });
  const date = (at, opts = {}) => new Date(at).toLocaleDateString('ar-LY-u-nu-latn', { day: 'numeric', month: 'short', ...opts });
  const time = at => new Date(at).toLocaleTimeString('ar-LY-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  const stamp = at => date(at) + '، ' + time(at);
  let state, demo = null, view = 'dashboard', busy = false, storageMode = '', installPrompt = null, swRegistration = null, reloadForUpdate = false;
  let chartDays = 14, logDays = '30', logContext = 'all', logStatus = 'all', logSearch = '', logPage = 1, learnCategory = 'all';
  let reportDays = '30', reportStart = '', reportEnd = C.dayKey(), activeReadingUnit = 'mg', editingId = '', sosTab = 'low';
  let backupCandidate = null, restoreCandidate = null, timerDeadline = 0, timerAnnounced = false, toastTimeout, searchTimeout;
  let readingDraftMg = null, readingDisplayValue = '';
  const notifiedDoses = new Set();
  const S = () => demo || state;
  const titles = { dashboard: 'نظرة على يومك', readings: 'سجل قراءاتك', plan: 'خطتك اليومية', labs: 'الفحوص والوزن', visits: 'مواعيدك وأسئلتك', learn: 'معرفة تطمئنك', reports: 'تقريرك للطبيب', settings: 'ملفك والأهداف', about: 'عن رفيق السكري' };
  const navItems = [['dashboard', 'الرئيسية', 'home'], ['readings', 'القراءات', 'drop'], ['plan', 'الخطة اليومية', 'pill'], ['labs', 'الفحوص والوزن', 'flask'], ['visits', 'المواعيد', 'calendar'], ['learn', 'مكتبة العناية', 'book'], ['reports', 'تقرير الطبيب', 'report']];
  function toast(message, error = false) {
    clearTimeout(toastTimeout); const el = $('#toast'); el.textContent = message; el.className = 'toast show' + (error ? ' error' : '');
    toastTimeout = setTimeout(() => el.classList.remove('show'), error ? 6500 : 4000);
  }
  function fillIcons(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); el.removeAttribute('data-icon'); }); }
  function navLink(key, label, ico) { return `<a href="#${key}" class="nav-link ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(ico)}<span>${label}</span></a>`; }
  function renderNav() {
    $('#desktopNav').innerHTML = navItems.map(n => navLink(...n)).join('');
    $('#mobileNav').innerHTML = [['dashboard', 'الرئيسية', 'home'], ['readings', 'القراءات', 'drop'], ['plan', 'خطتي', 'pill'], ['learn', 'العناية', 'book']].map(n => navLink(...n)).join('') + `<button class="nav-link ${['labs', 'visits', 'reports', 'settings', 'about'].includes(view) ? 'active' : ''}" data-action="more">${icon('plus')}<span>المزيد</span></button>`;
    $('#viewTitle').textContent = titles[view];
    $('.profile-avatar').textContent = S().profile.name.trim().charAt(0) || 'ر';
  }
  function go(next) { if (!Object.hasOwn(titles, next)) return; if (location.hash === '#' + next) { view = next; render(); } else location.hash = next; }
  function render() {
    document.body.classList.toggle('big-text', S().profile.largeText);
    $('#demoBanner').hidden = !demo;
    renderNav();
    const renderers = { dashboard: dashboard, readings: readingsPage, plan: planPage, labs: labsPage, visits: visitsPage, learn: learnPage, reports: reportsPage, settings: settingsPage, about: aboutPage };
    $('#main').innerHTML = renderers[view]();
    fillIcons($('#main')); updateTimer();
  }
  async function mutate(fn, success = 'تم الحفظ على هذا الجهاز') {
    if (busy) return false;
    busy = true;
    try {
      const next = C.clone(S()); fn(next); next.updatedAt = new Date().toISOString();
      if (demo) demo = next; else { await RafiqStore.save(next); state = next; }
      render(); if (success) toast(demo ? 'تغيير مؤقت في العرض التجريبي' : success); return true;
    } catch (e) { toast(e.message || 'تعذر الحفظ. لم تُعتمد العملية.', true); return false; }
    finally { busy = false; }
  }
  function empty(ico, title, text, button = '') { return `<div class="empty">${icon(ico)}<h3>${title}</h3><p>${text}</p>${button}</div>`; }
  function badge(r) { const status = C.classify(r, S().profile); return `<span class="status-badge ${status.tone}">${esc(status.label)}</span>`; }
  function sources(ids) { return ids.map(id => { const s = D.sources.find(x => x.id === id); return `<div class="source-link"><span>[${s.id}]</span><div><strong>${s.name}</strong><br><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title} ${icon('external')}</a></div></div>`; }).join(''); }
  function chart(readings, days = 14, print = false) {
    if (!readings.length) return empty('chart', 'هنا تتضح الصورة مع كل قراءة', 'أضف أول قراءة لعرض الرسم. أو جرب الواجهة ببيانات افتراضية دون تغيير سجلك.', `<button class="btn ${print ? 'secondary' : 'ghost'}" data-action="demo">تجربة العرض التوضيحي ${icon('arrow')}</button>`);
    const p = S().profile, sorted = [...readings].sort((a, b) => new Date(a.at) - new Date(b.at));
    const W = 720, H = 255, L = 52, R = 17, T = 18, B = 35, pw = W - L - R, ph = H - T - B;
    const maxVal = Math.max(p.chartHigh, ...sorted.map(r => r.mg));
    const minVal = Math.min(p.chartLow, ...sorted.map(r => r.mg));
    const yMin = Math.max(0, Math.floor((minVal - 20) / 20) * 20), yMax = Math.ceil((maxVal + 25) / 20) * 20;
    let start = new Date(); start.setDate(start.getDate() - Number(days) + 1); start.setHours(0, 0, 0, 0);
    let end = new Date(); end.setHours(23, 59, 59, 999);
    if (sorted[0] && new Date(sorted[0].at) < start) start = new Date(sorted[0].at);
    const span = Math.max(end - start, 86400000);
    const x = at => L + (new Date(at) - start) / span * pw;
    const y = v => T + (yMax - v) / (yMax - yMin) * ph;
    const plot = sorted.length > 350 ? sorted.filter((_, i) => i % Math.ceil(sorted.length / 350) === 0 || i === sorted.length - 1) : sorted;
    const lines = Array.from({ length: 5 }, (_, i) => { const v = yMin + (yMax - yMin) * i / 4; return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e7eef0"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" fill="#66818a" font-size="11" font-family="Cairo">${val(v)}</text>`; }).join('');
    const ticks = [0, .33, .66, 1].map(k => { const at = new Date(start.getTime() + span * k); return `<text x="${L + pw * k}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === 1 ? 'end' : 'middle'}" fill="#6c838c" font-size="10" font-family="Cairo">${esc(date(at))}</text>`; }).join('');
    const points = plot.map(r => { const low = r.mg < 70, high = r.mg > p.chartHigh; const label = `${val(r.mg)} ${unitAr()}، ${stamp(r.at)}، ${C.CONTEXTS[r.context]}`; return `<circle cx="${x(r.at)}" cy="${y(r.mg)}" r="${plot.length > 80 ? 2.4 : 4}" fill="${low ? '#b43f45' : high ? '#b59555' : '#147d86'}" stroke="#fff" stroke-width="1.5" ${print ? '' : `tabindex="0" role="button" data-action="edit-reading" data-id="${r.id}" aria-label="${esc(label)}"`}><title>${esc(label)}</title></circle>`; }).join('');
    return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" aria-label="رسم وصفي للقراءات المسجلة، الوحدة ${unitAr()}"><rect x="${L}" y="${y(p.chartHigh)}" width="${pw}" height="${y(p.chartLow) - y(p.chartHigh)}" fill="#eaf5f1" rx="4"/>${lines}<polyline points="${plot.map(r => `${x(r.at)},${y(r.mg)}`).join(' ')}" fill="none" stroke="#147d86" stroke-width="2" opacity=".75"/>${points}${ticks}</svg></div><div class="chart-caption"><span class="legend"><i></i> قراءات مسجلة <span dir="ltr">(${unitLabel()})</span></span><span class="legend"><i class="band"></i> نطاق العرض ${val(p.chartLow)}–${val(p.chartHigh)}</span></div><p class="subtext">الخط يصل بين القياسات المتفرقة للتوضيح؛ ليس قياسًا مستمرًا${sorted.length > 350 ? '، عُرضت عينة من النقاط لتسهيل الرسم؛ الإحصاءات تشمل جميع القراءات المحددة' : ''}.</p>`;
  }
  function metric(title, number, unit, ico, foot = '', color = '') { return `<div class="metric"><div class="metric-head"><span>${title}</span><span class="metric-icon ${color}">${icon(ico)}</span></div><div class="metric-value">${number}<small>${unit}</small></div><div class="metric-foot">${foot}</div></div>`; }
  function todayDoses() {
    const today = C.dayKey();
    return S().medications.flatMap(m => m.times.map(t => ({ ...m, time: t, key: `${m.id}|${today}|${t}`, taken: S().doseLog[`${m.id}|${today}|${t}`] === true }))).sort((a, b) => a.time.localeCompare(b.time));
  }
  function doseRows(rows) { return rows.map(d => `<div class="dose-row"><span class="dose-time">${d.time}</span><div><h4>${esc(d.name)}</h4><p>${esc(d.dose || 'وفق الوصفة المسجلة')}</p></div><button class="dose-check ${d.taken ? 'taken' : ''}" data-action="toggle-dose" data-id="${d.id}" data-time="${d.time}" aria-label="${esc(d.name)} ${d.time}: ${d.taken ? 'إلغاء علامة التناول' : 'تسجيل التناول'}" aria-pressed="${d.taken}">${icon('check')}</button></div>`).join(''); }
  function habitList() {
    const done = S().habits[C.dayKey()] || [];
    return [['food', 'اتبعت خطتي الغذائية'], ['activity', 'نفذت النشاط المناسب لخطتي'], ['feet', 'تفقدت قدميّ'], ['plan', 'راجعت مستلزمات متابعتي']].map(([key, label]) => `<label class="habit"><input type="checkbox" data-habit="${key}" ${done.includes(key) ? 'checked' : ''}> ${label}</label>`).join('');
  }
  function dashboard() {
    const s = S(), p = s.profile, sorted = [...s.readings].sort((a, b) => new Date(b.at) - new Date(a.at)), last = sorted[0], week = C.filterReadings(s.readings, { days: 7 }), st = C.stats(week, p);
    const newish = last && Date.now() - new Date(last.at) < 30 * 60000;
    const alert = last && newish && (last.mg < 70 || last.mg >= 300) ? `<div class="notice danger"><strong>${last.mg < 70 ? 'آخر قراءة منخفضة؛ راجع حالتك الآن' : 'آخر قراءة مرتفعة جدًا؛ انتبه لعلامات الخطر'}</strong>${last.mg < 70 ? 'إذا كانت حالية فاتبع خطة التعامل مع الهبوط. عند تأثر الوعي أو تعذر البلع اطلب الطوارئ.' : 'إذا استمر الارتفاع أو ترافق مع قيء أو صعوبة التنفس أو رائحة نفس فاكهية فاطلب الطوارئ فورًا.'} <button class="text-button danger" data-action="sos" data-tab="${last.mg < 70 ? 'low' : 'high'}">افتح الدليل ←</button></div>` : '';
    const doses = todayDoses();
    return `${alert}<section class="hero"><div class="hero-copy"><span class="eyebrow tag">${p.name ? `أهلًا، ${esc(p.name)}` : 'مساحتك الخاصة للمتابعة اليومية'}</span><h1>خطوة صغيرة اليوم،<br>صورة أوضح غدًا.</h1><p>قراءاتك، مواعيدك وملاحظاتك في مكان واحد.<br>معك أينما كنت، حتى دون إنترنت.</p><div class="hero-actions"><button class="btn primary" data-action="add-reading">${icon('plus')} سجّل قراءة جديدة</button><button class="btn ghost" data-action="report">${icon('report')} تقرير الطبيب</button></div></div><img class="hero-art" src="./assets/hero.svg" alt="رسم هاتف يعرض رمز قطرة السكر ورسم متابعة"></section>
    <div class="metrics">${metric('آخر قراءة مسجلة', last ? val(last.mg) : '—', unitLabel(), 'drop', last ? date(last.at) + ' · ' + time(last.at) : 'ابدأ بخطوة واحدة')}${metric('متوسط آخر 7 أيام', val(st.mean), unitLabel(), 'chart', `${st.count} قراءات مسجلة · ${st.days} أيام`)}${metric('قراءات داخل نطاق العرض', st.ratio === null ? '—' : st.ratio + '%', '', 'shield', `${val(p.chartLow)}–${val(p.chartHigh)} ${unitLabel()} · ليست نسبة الوقت`)}${metric('أيام لها تسجيل هذا الأسبوع', st.days, '/ 7', 'calendar', 'حسب خطتك، دون تقييم للالتزام', 'gold')}</div>
    <div class="two-col"><div><section class="panel"><div class="panel-header"><div><h3>ملامح قراءاتك</h3><p class="subtext">متابعة وصفية تساعد على الحوار مع طبيبك</p></div><div class="pills">${[7, 14, 30].map(d => `<button class="pill ${chartDays === d ? 'active' : ''}" data-action="chart-days" data-days="${d}">${d} يومًا</button>`).join('')}</div></div>${chart(C.filterReadings(s.readings, { days: chartDays }), chartDays)}</section>
    <section class="panel"><div class="panel-header"><h3>آخر القراءات</h3><a class="text-button" href="#readings">عرض السجل ${icon('arrow')}</a></div>${last ? sorted.slice(0, 4).map(r => `<div class="reading-mini"><span class="reading-number">${val(r.mg)}</span><div class="reading-info"><h4>${C.CONTEXTS[r.context]}</h4><p>${stamp(r.at)}</p></div>${badge(r)}<button class="icon-button" data-action="edit-reading" data-id="${r.id}" aria-label="تعديل القراءة">${icon('edit')}</button></div>`).join('') : empty('drop', 'سجلك يبدأ هنا', 'أدخل نتيجة جهاز القياس كما هي، مع توقيتها بالنسبة إلى الوجبة.', '<button class="text-button" data-action="add-reading">إضافة أول قراءة ←</button>')}</section></div>
    <div class="right-stack"><section class="panel"><div class="panel-header"><h3>جدول الدواء اليوم</h3><a href="#plan" class="text-button">${icon('arrow')}</a></div>${doses.length ? doseRows(doses.slice(0, 4)) : empty('pill', 'خطتك كما وصفها الطبيب', 'أضف أسماء أدويتك ومواعيدها من الوصفة.', '<button class="text-button" data-action="add-med">إعداد الجدول ←</button>')}<p class="subtext">التذكير داخل التطبيق أثناء فتحه فقط.</p></section>
    <section class="care-card"><span class="eyebrow">معرفة صغيرة، فرق كبير</span><h3>الرقم لا يروي القصة وحده.</h3><p>متى أكلت؟ هل شعرت بأعراض؟ ملاحظات بسيطة قد تجعل زيارتك الطبية أكثر فائدة.</p><button class="text-button" data-action="article" data-id="measure">كيف أسجل قراءة مفيدة؟ ${icon('arrow')}</button></section>
    <section class="panel"><div class="panel-header"><h3>لحظات عناية لنفسي</h3>${icon('heart')}</div>${habitList()}<p class="subtext">قائمة شخصية للتذكّر؛ ليست مقياسًا لصحتك.</p></section></div></div>
    <div class="section-title"><h3>ما الذي يخبرنا به السجل؟</h3><span class="subtext">ملخص وصفي، لا تشخيص</span></div><div class="insight-grid">${C.insights(s).map(x => `<article class="insight ${x.tone}"><div class="icon-bubble">${icon(x.icon)}</div><h4>${x.title}</h4><p>${x.text}</p></article>`).join('')}</div>${!p.targetsConfirmed ? '<div class="notice compact gold" style="margin-top:18px">أهداف العرض الأولية إرشادية للبالغين غير الحوامل. <button class="text-button" data-action="settings">سجّل الأهداف المتفق عليها مع فريقك ←</button></div>' : ''}`;
  }
  function selectedLogs() {
    let rows = logDays === 'all' ? [...S().readings].sort((a, b) => new Date(b.at) - new Date(a.at)) : C.filterReadings(S().readings, { days: Number(logDays) });
    if (logContext !== 'all') rows = rows.filter(r => r.context === logContext);
    if (logStatus !== 'all') rows = rows.filter(r => logStatus === 'low' ? r.mg < 70 : ['above', 'very-high'].includes(C.classify(r, S().profile).key));
    if (logSearch.trim()) rows = rows.filter(r => (r.note + ' ' + r.symptoms + ' ' + C.CONTEXTS[r.context]).includes(logSearch.trim()));
    return rows;
  }
  function readingsPage() {
    return `<div class="toolbar"><p>أدخل نتيجة جهازك، واحتفظ بسياقها. جميع القراءات تحفظ محليًا.</p><div class="toolbar-buttons"><button class="btn secondary" data-action="csv">${icon('download')} تصدير CSV</button><button class="btn primary" data-action="add-reading">${icon('plus')} قراءة جديدة</button></div></div><section class="panel"><div class="filters"><div class="field"><label for="logDays">الفترة</label><select id="logDays">${[['7', 'آخر 7 أيام'], ['14', 'آخر 14 يومًا'], ['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا'], ['all', 'كل السجل']].map(([v, l]) => `<option value="${v}" ${logDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="logContext">التوقيت</label><select id="logContext"><option value="all">جميع الأوقات</option>${Object.entries(C.CONTEXTS).map(([v, l]) => `<option value="${v}" ${logContext === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="logStatus">التصنيف</label><select id="logStatus"><option value="all">جميع القراءات</option><option value="low" ${logStatus === 'low' ? 'selected' : ''}>أقل من 70 ملغ/دل</option><option value="above" ${logStatus === 'above' ? 'selected' : ''}>مرتفعة بالنسبة للتوقيت</option></select></div><div class="field search"><label for="logSearch">بحث في الملاحظات</label><input id="logSearch" type="search" value="${esc(logSearch)}" placeholder="أعراض، وجبة، ملاحظة…" maxlength="100"></div></div><div id="logResults">${logTable()}</div></section><div class="notice compact">التصنيفات تستخدم توقيت القراءة والأهداف في ملفك. لا يُحكم على القراءة العشوائية بأهداف الوجبات. <button class="text-button" data-action="article" data-id="targets">تعرّف على الأهداف [1] ←</button></div>`;
  }
  function logTable() {
    const rows = selectedLogs(); const pages = Math.max(1, Math.ceil(rows.length / 20)); logPage = Math.min(logPage, pages);
    if (!rows.length) return empty('search', 'لا توجد قراءات في هذا الاختيار', S().readings.length ? 'غيّر الفترة أو التوقيت أو البحث لعرض سجلك.' : 'سجّل قراءتك الأولى أو جرّب البيانات الافتراضية.', '<button class="btn primary small" data-action="add-reading">إضافة قراءة</button>');
    return `<div class="table-wrap"><table><thead><tr><th>الوقت</th><th>القراءة <span dir="ltr">${unitLabel()}</span></th><th>التوقيت</th><th>التصنيف</th><th>الأعراض والملاحظات</th><th>إجراءات</th></tr></thead><tbody>${rows.slice((logPage - 1) * 20, logPage * 20).map(r => `<tr><td>${date(r.at)}<small>${time(r.at)}</small></td><td class="number">${val(r.mg)}</td><td>${C.CONTEXTS[r.context]}</td><td>${badge(r)}</td><td class="note-cell">${esc(r.symptoms)}${r.symptoms && r.note ? '<br>' : ''}${esc(r.note) || '—'}</td><td><div class="row-actions"><button class="icon-button" data-action="edit-reading" data-id="${r.id}" aria-label="تعديل قراءة ${val(r.mg)} في ${esc(stamp(r.at))}">${icon('edit')}</button><button class="icon-button" data-action="delete-reading" data-id="${r.id}" aria-label="حذف القراءة">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div><div class="pager"><span>${rows.length} قراءة · الصفحة ${logPage} من ${pages}</span><div><button class="btn small secondary" data-action="log-prev" ${logPage === 1 ? 'disabled' : ''}>السابق</button><button class="btn small secondary" data-action="log-next" ${logPage === pages ? 'disabled' : ''}>التالي</button></div></div>`;
  }
  function planPage() {
    const meds = S().medications, doses = todayDoses();
    return `<div class="toolbar"><p>مواعيدك كما في الوصفة، دون حساب جرعات أو تغييرها.</p><button class="btn primary" data-action="add-med">${icon('plus')} إضافة دواء موصوف</button></div><div class="notice gold">التذكيرات تظهر أثناء فتح التطبيق فقط، ولا تعمل كمنبّه مضمون عند إغلاقه. إذا فاتتك جرعة فاتبع تعليمات طبيبك أو الصيدلي؛ التطبيق لا يقترح جرعة بديلة.</div><div class="two-col"><div>${meds.length ? `<div class="med-grid">${meds.map(m => `<article class="med-card"><div class="med-card-head"><div><span class="eyebrow">من خطتك الموصوفة</span><h3>${esc(m.name)}</h3></div><span class="metric-icon">${icon('pill')}</span></div><div class="med-dose">${esc(m.dose) || 'لم يسجل نص الجرعة'}</div><p>${esc(m.note) || 'تذكّر مراجعة تعليمات الوصفة.'}</p><div class="mini-list">${doseRows(doses.filter(d => d.id === m.id))}</div><div class="card-actions"><button class="text-button" data-action="edit-med" data-id="${m.id}">${icon('edit')} تعديل</button><button class="text-button danger" data-action="delete-med" data-id="${m.id}">${icon('trash')} حذف من الجدول</button></div></article>`).join('')}</div>` : `<section class="panel">${empty('pill', 'دوّن خطتك أولًا', 'انسخ اسم الدواء ونص جرعته ومواعيده من وصفة معالجك. هذه أداة تنظيم فقط.', '<button class="btn primary" data-action="add-med">إضافة أول دواء</button>')}</section>`}</div><div><section class="panel"><div class="panel-header"><h3>لحظات عناية اليوم</h3>${icon('heart')}</div>${habitList()}<p class="subtext">هذه العلامات للتذكّر ولا تقيم نجاح العلاج.</p></section><section class="care-card"><span class="eyebrow">في متناول يدك</span><h3>جهّز خطة الهبوط.</h3><p>احتفظ بخطتك ومصدر سكر سريع، وشارك طريقة طلب المساعدة مع من حولك.</p><button class="text-button" data-action="sos">افتح دليل الهبوط ${icon('arrow')}</button></section></div></div>`;
  }
  function labsPage() {
    return `<div class="toolbar"><p>نتائج مختبرك ووزنك كما قِيسا، محفوظان بترتيب زمني.</p><button class="btn primary" data-action="add-lab">${icon('plus')} إضافة نتيجة</button></div><div class="lab-grid">${[['a1c', 'السكر التراكمي HbA1c', '%', 'flask'], ['weight', 'سجل الوزن', 'كغ', 'activity']].map(([kind, title, unit, ico]) => { const rows = S().labs.filter(l => l.kind === kind).sort((a, b) => new Date(b.at) - new Date(a.at)); return `<section class="panel"><div class="panel-header"><h3>${title}</h3><span class="metric-icon">${icon(ico)}</span></div>${rows.length ? rows.map(l => `<div class="lab-row"><div class="lab-value">${l.value}<small>${unit}</small></div><div class="lab-info"><h4>${date(l.at, { year: 'numeric' })}</h4><p>${esc(l.note)}</p></div><button class="icon-button" data-action="delete-lab" data-id="${l.id}" aria-label="حذف النتيجة">${icon('trash')}</button></div>`).join('') : empty(ico, 'لا توجد نتائج بعد', kind === 'a1c' ? 'أدخل نتيجة المختبر؛ لا نحسب التراكمي من القراءات المنزلية المتفرقة.' : 'سجل الوزن كما قسته دون حساب حمية أو جرعات.', `<button class="text-button" data-action="add-lab" data-kind="${kind}">إضافة نتيجة ←</button>`)}</section>`; }).join('')}</div><div class="notice"><strong>كل مؤشر يكمل الصورة</strong>التراكمي يعكس متوسطًا لنحو 3 أشهر ولا يستبدل المتابعة المنزلية. راجع نتيجته وأي تغير في الوزن مع الفريق الطبي. <button class="text-button" data-action="article" data-id="a1c">فهم التراكمي [5] ←</button></div>`;
  }
  function visitsPage() {
    const visits = [...S().visits].sort((a, b) => new Date(a.at) - new Date(b.at));
    return `<div class="toolbar"><p>جهّز أسئلتك واحتفظ بموعدك القادم في مكان واضح.</p><button class="btn primary" data-action="add-visit">${icon('plus')} موعد جديد</button></div><div class="two-col"><section><div class="section-title"><h3>المواعيد المسجلة</h3><span class="badge-count">${visits.length} مواعيد</span></div>${visits.length ? visits.map(v => `<article class="visit ${new Date(v.at) < new Date() ? 'past' : ''}"><div class="date-square"><strong>${new Date(v.at).getDate()}</strong><small>${date(v.at, { day: undefined })}</small></div><div class="visit-content"><h3>${esc(v.title)}</h3><p>${time(v.at)} ${v.place ? '· ' + esc(v.place) : ''}</p>${v.note ? `<p>${esc(v.note)}</p>` : ''}</div><div class="row-actions"><button class="icon-button" data-action="calendar" data-id="${v.id}" aria-label="تصدير الموعد للتقويم">${icon('calendar')}</button><button class="icon-button" data-action="edit-visit" data-id="${v.id}" aria-label="تعديل الموعد">${icon('edit')}</button><button class="icon-button" data-action="delete-visit" data-id="${v.id}" aria-label="حذف الموعد">${icon('trash')}</button></div></article>`).join('') : `<div class="panel">${empty('calendar', 'موعدك القادم يبدأ بتنظيم بسيط', 'أضف تاريخ الزيارة والعيادة؛ يمكنك تصدير الموعد لتقويم هاتفك.', '<button class="text-button" data-action="add-visit">إضافة موعد ←</button>')}</div>`}</section><section class="panel"><h3>أسئلة أود مناقشتها</h3><p class="subtext">ستظهر في تقرير الطبيب. تحفظ عند الضغط على زر الحفظ.</p><form id="questionsForm"><div class="field" style="margin-top:15px"><label for="questions">ملاحظاتي للزيارة</label><textarea id="questions" name="questions" rows="7" maxlength="5000" placeholder="مثلًا: ما توقيت القياس الأنسب لخطي؟ ماذا أفعل إذا تكرر الهبوط؟">${esc(S().questions)}</textarea></div><button class="btn primary full" type="submit">${icon('check')} حفظ أسئلتي</button></form><hr class="divider"><button class="text-button" data-action="report">${icon('report')} تجهيز تقرير للزيارة ←</button></section></div>`;
  }
  function learnPage() {
    const categories = ['all', ...new Set(D.cards.map(c => c.category))];
    const cards = D.cards.filter(c => learnCategory === 'all' || c.category === learnCategory);
    return `<div class="page-intro"><h2>معرفة بسيطة، من مصادر موثوقة.</h2><p>بطاقات مختصرة من ADA وCDC وNHS وNIDDK، مع مصادرها. النصوص والرسوم تعمل دون إنترنت؛ فتح مواقع المراجع يحتاج اتصالًا.</p></div><div class="toolbar"><div class="pills">${categories.map(c => `<button class="pill ${learnCategory === c ? 'active' : ''}" data-action="learn-category" data-category="${esc(c)}">${c === 'all' ? 'جميع الموضوعات' : c}</button>`).join('')}</div><span class="subtext">تاريخ التحقق: ${D.reviewed}</span></div><div class="learn-grid">${cards.map(c => `<article class="learn-card"><div class="learn-art ${c.color}">${icon(c.icon)}</div><div class="learn-card-body"><span class="category">${c.category}</span><h3>${c.title}</h3><p>${c.intro}</p><button class="text-button" data-action="article" data-id="${c.id}">اقرأ بهدوء ${icon('arrow')}</button></div></article>`).join('')}</div><section class="panel" style="margin-top:22px"><details><summary>المراجع الطبية ومراجعة المحتوى</summary><p class="subtext" style="margin:12px 0">الملخصات تعليمية ولا تعني مراجعة هذا التطبيق سريريًا. تحقق من تحديث الإرشادات مع فريقك؛ روابط المراجع الأصلية أدناه.</p>${sources(D.sources.map(s => s.id))}</details></section>`;
  }
  function reportRows() { return C.filterReadings(S().readings, reportDays === 'custom' ? { start: reportStart || C.dayKey(new Date(Date.now() - 29 * 86400000)), end: reportEnd || C.dayKey() } : { days: Number(reportDays) }); }
  function reportStats(st, print = false) { return `<div class="${print ? 'print-stats' : 'report-overview'}">${[[st.count, 'القراءات المسجلة'], [val(st.mean), `المتوسط ${unitLabel()}`], [val(st.min), `أقل قراءة ${unitLabel()}`], [val(st.max), `أعلى قراءة ${unitLabel()}`]].map(([v, l]) => `<div class="${print ? '' : 'report-number'}"><b>${v}</b><small>${l}</small></div>`).join('')}</div>`; }
  function reportBody() {
    const rows = reportRows(), st = C.stats(rows, S().profile);
    return `${reportStats(st)}<div class="report-notes"><strong>ملخص الفترة المحددة</strong><br>${st.days} أيام لها تسجيل. ${st.low} قراءات أقل من 70 ملغ/دل. ${st.inside} من ${st.count} قراءات داخل نطاق العرض ${val(S().profile.chartLow)}–${val(S().profile.chartHigh)} ${unitLabel()}.<br>هذه إحصاءات لإدخالات يدوية؛ لا تمثل نسبة الوقت ضمن النطاق، ولا تُقدّر السكر التراكمي أو سبب التغير.</div>${rows.length ? `<h3 style="margin:22px 0 12px">معاينة أحدث القراءات</h3><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>القراءة</th><th>التوقيت</th><th>ملاحظة</th></tr></thead><tbody>${rows.slice(0, 8).map(r => `<tr><td>${stamp(r.at)}</td><td dir="ltr">${val(r.mg)} ${unitLabel()}</td><td>${C.CONTEXTS[r.context]}</td><td class="note-cell">${esc(r.note) || '—'}</td></tr>`).join('')}</tbody></table></div><p class="subtext">هذه معاينة فقط؛ ملف CSV يشمل كل القراءات المحددة. تقرير الطباعة يدعم أحدث 2000 قراءة.</p>` : empty('report', 'سجلك جاهز ليبدأ', 'ستظهر هنا إحصاءات الفترة بعد إضافة قراءات. يمكنك الآن تجهيز تقرير بالمواعيد والأسئلة والأدوية.')}`;
  }
  function reportsPage() {
    return `<div class="page-intro"><h2>زيارة أقصر في الشرح، أوضح في التفاصيل.</h2><p>ملخص مرتب للقراءات والفحوص والدواء والأسئلة. راجعه قبل مشاركته مع طبيبك؛ لا يُرسل تلقائيًا لأي جهة.</p></div><section class="panel"><div class="toolbar"><div class="filters" style="margin:0"><div class="field"><label for="reportDays">فترة التقرير</label><select id="reportDays">${[['7', 'آخر 7 أيام'], ['14', 'آخر 14 يومًا'], ['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا'], ['custom', 'فترة محددة']].map(([v, l]) => `<option value="${v}" ${reportDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${reportDays === 'custom' ? `<div class="field"><label for="reportStart">من</label><input type="date" id="reportStart" value="${reportStart || C.dayKey(new Date(Date.now() - 29 * 86400000))}" max="${C.dayKey()}"></div><div class="field"><label for="reportEnd">إلى</label><input type="date" id="reportEnd" value="${reportEnd}" max="${C.dayKey()}"></div>` : ''}</div><div class="toolbar-buttons"><button class="btn secondary" data-action="report-csv">${icon('download')} CSV</button><button class="btn primary" data-action="print-report">${icon('print')} طباعة / حفظ PDF</button></div></div><div id="reportBody">${reportBody()}</div></section>`;
  }
  function settingsPage() {
    const p = S().profile;
    return `<div class="settings-grid"><section class="panel"><h3>ملفي وأهدافي</h3><p class="subtext">الاسم اختياري؛ يكفي اسم أول أو اسم مستعار.</p><form id="settingsForm" style="margin-top:18px"><div class="field-grid"><div class="field"><label for="profileName">الاسم الذي تفضله</label><input id="profileName" name="name" maxlength="60" value="${esc(p.name)}" autocomplete="off"></div><div class="field"><label for="profileUnit">وحدة عرض القراءات</label><select id="profileUnit" name="unit"><option value="mg" ${p.unit === 'mg' ? 'selected' : ''}>mg/dL — ملغ/دل</option><option value="mmol" ${p.unit === 'mmol' ? 'selected' : ''}>mmol/L — ملمول/لتر</option></select></div></div><div class="field"><label for="profileType">نوع السكري (اختياري)</label><select id="profileType" name="type">${[['unspecified', 'غير محدد'], ['type1', 'النوع الأول'], ['type2', 'النوع الثاني'], ['other', 'نوع آخر']].map(([v, l]) => `<option value="${v}" ${p.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><hr class="divider"><h4>أهداف اتفقت عليها مع فريقي الطبي</h4><p class="subtext">الحقول التالية بالملغ/دل دائمًا لتجنب التباس الوحدة. يمكن استخدام أداة التحويل أدناه. الأرقام الأولية إرشادية للبالغين غير الحوامل [1].</p><div class="field-grid" style="margin-top:15px"><div class="field"><label for="beforeLow">قبل الوجبة: الحد الأدنى</label><input id="beforeLow" name="beforeLow" value="${p.beforeLow}" inputmode="decimal" required></div><div class="field"><label for="beforeHigh">قبل الوجبة: الحد الأعلى</label><input id="beforeHigh" name="beforeHigh" value="${p.beforeHigh}" inputmode="decimal" required></div></div><div class="field"><label for="afterHigh">بعد 1–2 ساعة من بداية الوجبة: أقل من</label><input id="afterHigh" name="afterHigh" value="${p.afterHigh}" inputmode="decimal" required></div><label class="checkline"><input type="checkbox" name="confirmed" ${p.targetsConfirmed ? 'checked' : ''}><span>هذه الأهداف متفق عليها مع فريقي الطبي.</span></label><div class="notice compact">للحمل والأطفال أهداف خاصة. تصنيف الهبوط أقل من 70 ثابت ولا يُلغى بتغيير نطاق الرسم.</div><h4>نطاق الرسم والإحصاء الوصفي</h4><p class="subtext">لون مساعد لقراءة السجل؛ لا يُستخدم وحده لتقرير العلاج.</p><div class="field-grid" style="margin-top:12px"><div class="field"><label for="chartLow">من (ملغ/دل)</label><input id="chartLow" name="chartLow" value="${p.chartLow}" inputmode="decimal" required></div><div class="field"><label for="chartHigh">إلى (ملغ/دل)</label><input id="chartHigh" name="chartHigh" value="${p.chartHigh}" inputmode="decimal" required></div></div><div class="field"><label for="emergencyPhone">رقم جهة الطوارئ أو شخص موثوق (اختياري)</label><input id="emergencyPhone" name="phone" type="tel" maxlength="25" value="${esc(p.emergencyPhone)}" dir="ltr" placeholder="اكتب الرقم الصحيح لبلدك"><small>لا نحدد رقم إسعاف تلقائيًا؛ تحقق منه قبل حفظه.</small></div><label class="checkline"><input type="checkbox" name="largeText" ${p.largeText ? 'checked' : ''}> تكبير النصوص لمزيد من الوضوح</label><div id="settingsError" class="form-error" hidden></div><button class="btn primary full" type="submit">${icon('check')} حفظ الملف والأهداف</button></form></section><div><section class="panel"><h3>بياناتك تحت يدك</h3><p class="subtext" style="margin:8px 0 16px">السجل على هذا المتصفح وهذا الجهاز. حذف بيانات المتصفح أو تغيير الجهاز قد يفقده؛ احتفظ بنسخة احتياطية.</p><div class="choice-grid"><button class="choice-button" data-action="backup">${icon('lock')}<strong>نسخة احتياطية</strong><small>تشفير اختياري بكلمة مرور</small></button><button class="choice-button" data-action="restore">${icon('upload')}<strong>استعادة نسخة</strong><small>مع معاينة قبل الاستبدال</small></button></div><hr class="divider"><button class="text-button" data-action="persist">${icon('shield')} طلب الاحتفاظ بالتخزين على الجهاز</button><p class="subtext">قد يوافق المتصفح أو يرفض؛ النسخة الاحتياطية تظل مهمة.</p><hr class="divider"><button class="text-button danger" data-action="clear-data">${icon('trash')} حذف جميع بياناتي من هذا التطبيق</button></section><section class="panel"><h3>أدوات صغيرة مفيدة</h3><div class="mini-list"><button class="btn secondary full" style="margin-top:14px" data-action="converter">${icon('drop')} تحويل وحدة القراءة</button><button class="btn secondary full" style="margin-top:10px" data-action="install">${icon('phone')} تثبيت والعمل بلا إنترنت</button><button class="btn secondary full" style="margin-top:10px" data-action="demo">${icon('chart')} تجربة ببيانات افتراضية</button></div></section><section class="care-card"><h3>خصوصية واضحة.</h3><p>لا توجد حسابات أو تحليلات تتبع أو إرسال للسجل. بيانات المتصفح نفسها غير مشفرة بكلمة مرور داخل التطبيق؛ احمِ جهازك، واستخدم تشفير النسخة عند تنزيلها.</p></section></div></div>`;
  }
  function aboutPage() {
    return `<section class="panel"><div class="about-brand"><img src="./assets/research-logo.png" alt="شعار جامعة بنغازي المرفق بورقة العمل"><div><span class="eyebrow">ورقة عمل بحثية ومشروع تطبيقي</span><h2>رفيق السكري</h2><p>واجهة عربية للمتابعة والتثقيف · الإصدار ${C.VERSION}</p></div></div><p>يقدم هذا النموذج مساحة لتسجيل القياسات وفهم السجل وتجهيز الزيارة الطبية، انطلاقًا من ورقة العمل «تطبيق متابعة مرضى السكري».</p><hr class="divider"><h3 style="margin-bottom:14px">إعداد الطالبتين</h3>${D.authors.map(a => `<div class="author-card"><div class="avatar">${a.name.charAt(0)}</div><div><h3>${a.name}</h3><p>الرقم الدراسي: <strong>${a.number}</strong></p></div></div>`).join('')}<a class="btn primary" href="./research/ورقة_العمل_المبدئية.pdf" download>${icon('download')} ورقة العمل المبدئية PDF</a><hr class="divider"><div class="info-grid"><div class="info-tile"><strong>مساند للمتابعة</strong><p>لا يقيس السكر ولا يشخّص المرض ولا يحسب جرعات الدواء. الأهداف الفردية وقرارات العلاج مع الفريق الطبي.</p></div><div class="info-tile"><strong>مشروع قيد التطوير</strong><p>هذا نموذج جامعي وظيفي؛ لا يدعي اعتمادًا طبيًا أو نتائج تجربة سريرية. سيحتاج تقييمًا مستقلًا قبل الاستخدام السريري المنظم.</p></div><div class="info-tile"><strong>بيانات على جهازك</strong><p>دون مزامنة سحابية أو حسابات أو رفع تلقائي. النسخ والتقارير ينزلها المستخدم ويختار بنفسه من يشاركها معه.</p></div><div class="info-tile"><strong>معك بلا إنترنت</strong><p>بعد الزيارة الأولى الناجحة وتجهيز الملفات. الروابط الخارجية تحتاج اتصالًا، والتنبيهات تعمل أثناء فتح التطبيق فقط.</p></div></div><hr class="divider"><h3>المحتوى العلمي</h3><p class="subtext" style="margin:7px 0 15px">مصادر أولية رسمية تحقّقنا منها في ${D.reviewed}. إدراج شعار البحث لا يعني اعتماد التطبيق من الجامعة أو الجهات المذكورة.</p>${sources(D.sources.map(s => s.id))}</section>`;
  }

  // Dialogs and actions are defined below. All patient text is escaped on output.
  function openDialog(title, body, footer = '') {
    const el = $('#appDialog');
    $('#dialogContent').innerHTML = `<div class="dialog-head"><h2 id="dialogTitle">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="إغلاق">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`;
    if (!el.open) el.showModal();
    fillIcons(el);
  }
  function closeDialog() { $('#appDialog').close(); }
  function showError(form, message) { let box = $('.form-error', form); if (!box) { box = document.createElement('div'); box.className = 'form-error'; form.prepend(box); } box.hidden = false; box.textContent = message; box.setAttribute('role', 'alert'); }
  function readingDialog(reading) {
    editingId = reading?.id || ''; activeReadingUnit = S().profile.unit;
    readingDraftMg = reading?.mg ?? null;
    readingDisplayValue = reading ? String(C.fromMg(reading.mg, activeReadingUnit)) : '';
    openDialog(reading ? 'تعديل قراءة' : 'قراءة جديدة', `<form id="readingForm"><div class="pills"><button type="button" class="pill ${activeReadingUnit === 'mg' ? 'active' : ''}" data-action="reading-unit" data-unit="mg">mg/dL</button><button type="button" class="pill ${activeReadingUnit === 'mmol' ? 'active' : ''}" data-action="reading-unit" data-unit="mmol">mmol/L</button></div><div class="field large-value"><label for="readingValue">القراءة كما تظهر على جهازك <span id="readingUnitLabel" dir="ltr">${unitLabel()}</span></label><input type="text" id="readingValue" name="value" inputmode="decimal" placeholder="${activeReadingUnit === 'mg' ? 'مثلًا 125' : 'مثلًا 6.9'}" value="${reading ? C.fromMg(reading.mg, activeReadingUnit) : ''}" required autocomplete="off"><small>التطبيق يسجل النتيجة ولا يقيس السكر. للأرقام HI وLO اتبع دليل الجهاز وخطتك الطبية.</small></div><div class="field"><label for="readingAt">تاريخ القياس ووقته</label><input id="readingAt" type="datetime-local" name="at" value="${C.localInput(reading?.at || new Date())}" required max="${C.localInput(new Date(Date.now() + 300000))}"></div><div class="field"><label for="readingContext">متى قِست السكر؟</label><select id="readingContext" name="context">${Object.entries(C.CONTEXTS).map(([v, l]) => `<option value="${v}" ${reading?.context === v || !reading && v === 'random' ? 'selected' : ''}>${l}</option>`).join('')}</select><small>«بعد الوجبة» يعني 1–2 ساعة من بداية الوجبة [1].</small></div><div class="field"><label for="readingSymptoms">أعراض مصاحبة (اختياري)</label><input id="readingSymptoms" name="symptoms" value="${esc(reading?.symptoms)}" maxlength="100" placeholder="مثلًا: تعرق، رجفة، لا توجد أعراض"></div><div class="field"><label for="readingNote">ملاحظة تساعدك وطبيبك (اختياري)</label><textarea id="readingNote" name="note" maxlength="1000" placeholder="وجبة، نشاط، مرض، توتر…">${esc(reading?.note)}</textarea></div><div class="form-error" hidden></div><button class="btn primary full" type="submit">${icon('check')} حفظ القراءة</button></form>`);
    setTimeout(() => $('#readingValue')?.focus(), 50);
  }
  function medicationDialog(med) {
    editingId = med?.id || '';
    openDialog(med ? 'تعديل الدواء الموصوف' : 'إضافة دواء من وصفتك', `<form id="medForm"><div class="notice compact gold">انسخ الخطة الموصوفة لك. لا يقدم التطبيق اقتراحات دوائية أو تعديل جرعات.</div><div class="field"><label for="medName">اسم الدواء</label><input id="medName" name="name" maxlength="80" value="${esc(med?.name)}" required></div><div class="field"><label for="medDose">نص الجرعة من الوصفة</label><input id="medDose" name="dose" maxlength="100" value="${esc(med?.dose)}" placeholder="كما كتبها الطبيب" required></div><div class="field"><label for="medTimes">المواعيد اليومية بصيغة 24 ساعة</label><input id="medTimes" name="times" dir="ltr" value="${med?.times.join(', ') || '08:00'}" required placeholder="08:00, 20:00"><small>افصل بين المواعيد بفاصلة، حتى 8 مواعيد. للدواء اليومي فقط؛ لا يصلح هذا الجدول لخطط الأيام المتغيرة.</small></div><div class="field"><label for="medNote">تعليمات الوصفة (اختياري)</label><input id="medNote" name="note" maxlength="200" value="${esc(med?.note)}"></div><div class="form-error" hidden></div><button class="btn primary full" type="submit">${icon('check')} حفظ الجدول اليومي</button></form>`);
  }
  function labDialog(kind = 'a1c') {
    openDialog('تسجيل نتيجة', `<form id="labForm"><div class="field"><label for="labKind">نوع النتيجة</label><select id="labKind" name="kind"><option value="a1c" ${kind === 'a1c' ? 'selected' : ''}>السكر التراكمي HbA1c (%)</option><option value="weight" ${kind === 'weight' ? 'selected' : ''}>الوزن (كغ)</option></select></div><div class="field"><label for="labValue">القيمة المقاسة</label><input id="labValue" name="value" inputmode="decimal" required placeholder="أدخل النتيجة كما هي"></div><div class="field"><label for="labAt">تاريخ القياس</label><input type="date" id="labAt" name="at" value="${C.dayKey()}" max="${C.dayKey()}" required></div><div class="field"><label for="labNote">ملاحظة (اختياري)</label><textarea id="labNote" name="note" maxlength="500"></textarea></div><div class="form-error" hidden></div><button class="btn primary full" type="submit">حفظ النتيجة</button></form>`);
  }
  function visitDialog(visit) {
    editingId = visit?.id || '';
    openDialog(visit ? 'تعديل موعد' : 'موعد جديد', `<form id="visitForm"><div class="field"><label for="visitTitle">عنوان الزيارة</label><input id="visitTitle" name="title" maxlength="100" value="${esc(visit?.title)}" placeholder="متابعة مع طبيب السكري" required></div><div class="field"><label for="visitAt">التاريخ والوقت</label><input id="visitAt" name="at" type="datetime-local" value="${C.localInput(visit?.at || new Date(Date.now() + 86400000))}" required></div><div class="field"><label for="visitPlace">العيادة أو المكان (اختياري)</label><input id="visitPlace" name="place" maxlength="150" value="${esc(visit?.place)}"></div><div class="field"><label for="visitNote">ملاحظة (اختياري)</label><textarea id="visitNote" name="note" maxlength="500">${esc(visit?.note)}</textarea></div><div class="form-error" hidden></div><button class="btn primary full" type="submit">حفظ الموعد</button></form>`);
  }
  function articleDialog(id) {
    const article = D.cards.find(c => c.id === id); if (!article) return;
    openDialog(article.title, `<div class="article-body"><span class="category">${article.category}</span>${article.body}<h3 style="margin:20px 0 10px">المصادر</h3>${sources(article.refs)}<p class="subtext">تاريخ التحقق: ${D.reviewed}. روابط المواقع تحتاج اتصالًا بالإنترنت.</p></div>`, article.id === 'low' || article.id === 'unconscious' ? '<button class="btn primary" data-action="sos">افتح دليل الهبوط والمؤقت</button>' : '<button class="btn secondary" data-action="close-dialog">تم</button>');
  }
  function confirmDialog(title, text, action, id = '') { openDialog(title, `<p>${text}</p>`, `<button class="btn danger" data-action="${action}" data-id="${id}">تأكيد الحذف</button><button class="btn secondary" data-action="close-dialog">إلغاء</button>`); }
  function sosDialog(tab = 'low') {
    sosTab = ['low', 'unconscious', 'high'].includes(tab) ? tab : 'low';
    const phone = S().profile.emergencyPhone.replace(/[^\d+]/g, '');
    const emergency = phone ? `<a class="emergency-link" href="tel:${phone}">${icon('phone')} الاتصال بالرقم الذي حفظته: <span dir="ltr">${esc(phone)}</span></a>` : '<p class="notice compact danger">اطلب الإسعاف أو الطوارئ المحلية. يمكنك حفظ رقم صحيح لبلدك في إعدادات التطبيق.</p>';
    const tabs = `<div class="sos-switch">${[['low', 'واعٍ ويستطيع البلع'], ['unconscious', 'الوعي أو البلع متأثر'], ['high', 'ارتفاع وعلامات خطر']].map(([v, l]) => `<button class="btn small ${sosTab === v ? 'primary' : 'secondary'}" data-action="sos" data-tab="${v}">${l}</button>`).join('')}</div>`;
    let body;
    if (sosTab === 'low') body = `<div class="notice compact danger"><strong>عند قراءة أقل من 70 ملغ/دل (نحو 3.9 ملمول/لتر)</strong>إذا كان الوعي أو البلع متأثرًا اختر القسم المخصص واطلب المساعدة. أقل من 54 هبوط مهم يتطلب تصرفًا فوريًا، وقد تحتاج إلى مساعدة شخص آخر.</div><div class="sos-step"><span class="step-number">1</span><div><h3>سكر سريع، حسب خطتك</h3><p>للبالغ الواعي القادر على البلع: 15 غرامًا من الكربوهيدرات سريعة الامتصاص؛ مثل أقراص غلوكوز توفر هذه الكمية وفق الملصق.</p></div></div><div class="sos-step"><span class="step-number">2</span><div><h3>أعد القياس بعد 15 دقيقة</h3><p>كرر إذا بقي أقل من 70 حتى يعود إلى النطاق المستهدف. بعد التعافي تناول وجبة أو وجبة خفيفة مناسبة. تختلف كمية الأطفال حسب خطة فريقهم.</p></div></div><div class="timer-display" id="sosTimer">${timerDeadline ? timerText() : '15:00'}</div><label class="checkline"><input type="checkbox" id="safeSwallow"><span>المصاب بالغ، واعٍ وقادر على البلع بأمان، وقد تناول السكر السريع.</span></label><button class="btn primary full" data-action="start-timer">${icon('clock')} ${timerDeadline ? 'إعادة بدء مؤقت 15 دقيقة' : 'ابدأ مؤقت إعادة القياس'}</button><p class="timer-note" style="margin-top:9px">يحسب الوقت عند الرجوع للتطبيق. لا يضمن التنبيه وهو مغلق. انتهاء المؤقت لا يعني التعافي.</p><div class="form-error" id="timerError" hidden></div>${sources([2, 8])}`;
    else if (sosTab === 'unconscious') body = `<div class="notice danger"><strong>اطلب المساعدة الطبية العاجلة فورًا</strong>تأثر الوعي أو تعذر البلع أهم من الرقم الظاهر على الجهاز.</div>${emergency}<div class="sos-step"><span class="step-number">1</span><div><h3>لا طعام أو شراب بالفم</h3><p>عند تعذر البلع أو فقد الوعي، لا تعطِ سكرًا أو ماءً عن طريق الفم.</p></div></div><div class="sos-step"><span class="step-number">2</span><div><h3>ابقَ مع المصاب واتبع الطوارئ</h3><p>إن كان فاقد الوعي ويتنفس فضعه في وضعية الإفاقة. استخدم الغلوكاغون الموصوف إذا توفر وكنت تعرف استعماله، واتبع تعليمات الطوارئ.</p></div></div>${sources([3])}`;
    else body = `<div class="notice danger"><strong>لا تنتظر رقمًا معينًا عند وجود علامات الخطر</strong>لا تشخّص هذه الصفحة الحماض الكيتوني، ولا تحسب جرعة تصحيح.</div><ul class="checklist">${['استمرار السكر عند 300 ملغ/دل (نحو 16.7 ملمول/لتر) أو أكثر.', 'قيء يمنع الاحتفاظ بالطعام أو السوائل.', 'صعوبة تنفس أو رائحة نفس فاكهية.', 'كيتونات مرتفعة أو عدة علامات للحماض الكيتوني.'].map(t => `<li>${icon('shield')}<span>${t}</span></li>`).join('')}</ul><p>اطلب الطوارئ فورًا مع هذه العلامات. اتبع خطة أيام المرض المتفق عليها مع فريقك. لا تنتظر وصول السكر إلى 300 إذا ظهرت الأعراض الخطرة.</p>${emergency}${sources([4])}`;
    openDialog('دليل التعامل مع القراءة', tabs + body);
    updateTimer();
  }
  const timerKey = 'rafiq-recheck:' + new URL('.', location.href).pathname;
  function timerText() { const seconds = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function updateTimer() {
    const dock = $('#timerDock'); if (!dock) return;
    dock.hidden = !timerDeadline;
    if (!timerDeadline) return;
    const text = timerText(); $('#timerDockTime').textContent = text;
    if ($('#sosTimer')) $('#sosTimer').textContent = text;
    if (Date.now() >= timerDeadline && !timerAnnounced) { timerAnnounced = true; toast('حان وقت إعادة قياس السكر. انتهاء المؤقت لا يثبت التعافي.', true); navigator.vibrate?.([150, 100, 150]); }
    if (timerAnnounced) $('#timerDockTime').textContent = 'حان وقت القياس';
  }
  function startTimer() {
    if (!$('#safeSwallow')?.checked) { $('#timerError').hidden = false; $('#timerError').textContent = 'أكد الوعي والقدرة على البلع وتناول السكر السريع أولًا. عند تأثر الوعي اطلب المساعدة العاجلة.'; return; }
    timerDeadline = Date.now() + 15 * 60000; timerAnnounced = false;
    try { localStorage.setItem(timerKey, String(timerDeadline)); } catch {}
    updateTimer(); toast('بدأ مؤقت إعادة القياس لمدة 15 دقيقة.');
  }
  function download(text, name, mime = 'application/json;charset=utf-8') {
    const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function printReport() {
    if (reportDays === 'custom' && reportStart && reportEnd && reportStart > reportEnd) { toast('تاريخ البداية يجب أن يسبق النهاية.', true); return; }
    const s = S(), all = reportRows(), rows = all.slice(0, 2000), st = C.stats(all, s.profile), p = s.profile;
    const start = reportDays === 'custom' ? (reportStart || C.dayKey(new Date(Date.now() - 29 * 86400000))) : C.dayKey(new Date(new Date().setDate(new Date().getDate() - Number(reportDays) + 1)));
    const end = reportDays === 'custom' ? (reportEnd || C.dayKey()) : C.dayKey();
    $('#printRoot').innerHTML = `${demo ? '<div class="print-demo">عرض تجريبي: هذا التقرير يحتوي بيانات افتراضية، وليس تقرير مريض حقيقيًا.</div>' : ''}<header class="print-header"><img src="./assets/app-icon.svg" alt=""><div><h1>رفيق السكري | تقرير متابعة</h1><p>سجل منزلي وصفي لعرضه على الفريق الطبي</p></div></header><div class="print-meta"><span>الاسم: ${esc(p.name) || 'غير مسجل'}</span><span>الفترة: ${esc(start)} إلى ${esc(end)}</span><span>تاريخ إنشاء التقرير: ${stamp(new Date())}</span><span>الوحدة: <b dir="ltr">${unitLabel()}</b></span></div>${reportStats(st, true)}<p class="print-note">${st.low} قراءات أقل من 70 ملغ/دل. ${st.inside} من ${st.count} ضمن نطاق العرض ${val(p.chartLow)}–${val(p.chartHigh)} ${unitLabel()}. الأهداف المسجلة قبل الوجبة ${val(p.beforeLow)}–${val(p.beforeHigh)}، وبعد 1–2 ساعة من بداية الوجبة أقل من ${val(p.afterHigh)} ${unitLabel()}. ${p.targetsConfirmed ? 'أقر المستخدم باتفاقه على الأهداف مع الفريق.' : 'لم يقر المستخدم بعد بتخصيص الأهداف مع فريقه.'}<br>البيانات إدخالات يدوية وليست قياسًا مستمرًا؛ النسبة نسبة قراءات وليست نسبة الوقت، ولا نستنتج التراكمي منها. لا يقدم التطبيق تشخيصًا أو جرعات.</p><h2>القراءات المسجلة</h2>${all.length > 2000 ? '<p>اقتصر جدول الطباعة على أحدث 2000 قراءة. الإحصاءات أعلاه تشمل كل الفترة؛ CSV يتضمن كامل السجل المحدد.</p>' : ''}<table><thead><tr><th>الوقت المحلي</th><th>القراءة</th><th>التوقيت</th><th>أعراض وملاحظات</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td>${stamp(r.at)}</td><td dir="ltr">${val(r.mg)}</td><td>${C.CONTEXTS[r.context]}</td><td>${esc(r.symptoms)} ${esc(r.note)}</td></tr>`).join('') : '<tr><td colspan="4">لا توجد قراءات في الفترة المحددة.</td></tr>'}</tbody></table><h2>آخر الفحوص والوزن المسجلين</h2><table><thead><tr><th>المؤشر</th><th>القيمة</th><th>التاريخ</th><th>ملاحظة</th></tr></thead><tbody>${[...s.labs].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8).map(l => `<tr><td>${l.kind === 'a1c' ? 'HbA1c' : 'الوزن'}</td><td>${l.value} ${l.kind === 'a1c' ? '%' : 'كغ'}</td><td>${date(l.at, { year: 'numeric' })}</td><td>${esc(l.note)}</td></tr>`).join('') || '<tr><td colspan="4">لم تسجل نتائج.</td></tr>'}</tbody></table><h2>الخطة الدوائية المدخلة من المستخدم</h2><table><thead><tr><th>الاسم</th><th>نص الوصفة</th><th>المواعيد اليومية</th></tr></thead><tbody>${s.medications.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)} ${esc(m.note)}</td><td dir="ltr">${m.times.join('، ')}</td></tr>`).join('') || '<tr><td colspan="3">لم يسجل جدول أدوية.</td></tr>'}</tbody></table><h2>أسئلة وملاحظات للزيارة</h2><p style="white-space:pre-wrap">${esc(s.questions) || 'لم تسجل أسئلة.'}</p><div class="print-footer">مشروع الطالبتين: مبروكة امراجع امعزب (5784) · نسرين إدريس صفي الدين (5783). راجع صحة المدخلات مع المريض؛ هذا نموذج جامعي لا يدعي اعتمادًا سريريًا. المصادر الطبية في مكتبة التطبيق. لا يُرسل التقرير تلقائيًا.</div>`;
    window.print();
  }
  function calendarExport(id) {
    const v = S().visits.find(x => x.id === id); if (!v) return;
    const escapeIcs = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const format = at => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rafiq Diabetes//Arabic Patient Calendar//AR', 'BEGIN:VEVENT', `UID:${v.id}@rafiq-diabetes.local`, `DTSTAMP:${format(new Date())}`, `DTSTART:${format(v.at)}`, `DTEND:${format(new Date(new Date(v.at).getTime() + 30 * 60000))}`, `SUMMARY:${escapeIcs(v.title)}`, `LOCATION:${escapeIcs(v.place)}`, `DESCRIPTION:${escapeIcs(v.note)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download(ics, 'rafiq-appointment.ics', 'text/calendar;charset=utf-8');
  }

  // Backup, PWA installation, event routing and boot follow.
  function backupDialog() {
    openDialog('نسخة احتياطية من سجلي', `<form id="backupForm"><p class="subtext">تتضمن النسخة القراءات والأهداف والأدوية والفحوص والمواعيد. احفظها في مكان تختاره؛ لا نرفعها لأي جهة.</p><label class="checkline"><input type="checkbox" id="encryptBackup" name="encrypt" checked><span>تشفير النسخة بكلمة مرور (موصى به)</span></label><div id="backupPasswordFields"><div class="field"><label for="backupPassword">كلمة مرور — 8 أحرف على الأقل</label><input id="backupPassword" type="password" name="password" minlength="8" autocomplete="new-password"></div><div class="field"><label for="backupPasswordAgain">تأكيد كلمة المرور</label><input id="backupPasswordAgain" type="password" name="again" autocomplete="new-password"></div><p class="subtext">لن تحفظ كلمة المرور في التطبيق، ولا يمكن استعادتها إذا نسيتها. التشفير يخص ملف النسخة؛ سجل المتصفح نفسه غير مشفر بكلمة مرور.</p></div><div class="notice compact gold" id="plainBackupNotice" hidden>النسخة غير المشفرة يمكن لأي شخص يملك ملفها قراءتها.</div><div class="form-error" hidden></div><button class="btn primary full" style="margin-top:17px" type="submit">${icon('download')} تنزيل النسخة</button></form>`);
  }
  const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
  const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  async function cryptoKey(password, salt, usage) {
    if (!crypto?.subtle) throw new Error('التشفير يحتاج متصفحًا حديثًا واتصال HTTPS. يمكنك اختيار نسخة عادية وحفظها في مكان آمن.');
    const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, raw, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }
  async function encryptBackup(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await cryptoKey(password, salt, 'encrypt');
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    return { app: 'rafiq-diabetes', encrypted: true, version: 1, algorithm: 'AES-GCM-256', kdf: 'PBKDF2-SHA256-250000', salt: b64(salt), iv: b64(iv), cipher: b64(new Uint8Array(cipher)) };
  }
  async function decryptBackup(wrapper, password) {
    if (wrapper.app !== 'rafiq-diabetes' || wrapper.version !== 1 || wrapper.algorithm !== 'AES-GCM-256' || wrapper.kdf !== 'PBKDF2-SHA256-250000' || typeof wrapper.cipher !== 'string') throw new Error('صيغة التشفير غير متوافقة.');
    try {
      const salt = unb64(wrapper.salt), iv = unb64(wrapper.iv);
      if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid parameters');
      const key = await cryptoKey(password, salt, 'decrypt');
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(wrapper.cipher));
      return JSON.parse(new TextDecoder().decode(data));
    } catch { throw new Error('تعذر فك النسخة: كلمة المرور غير صحيحة أو الملف تالف.'); }
  }
  function previewRestore(raw) {
    restoreCandidate = C.validateBackup(raw);
    const incoming = restoreCandidate;
    openDialog('معاينة النسخة قبل الاستعادة', `<div class="notice gold"><strong>الاستعادة تستبدل السجل الحالي كاملًا</strong>لن ندمج نسختين. سجلك الحالي يحتوي ${S().readings.length} قراءة؛ نزّل نسخة منه أولًا إن كنت تحتاجها.</div><div class="info-grid"><div class="info-tile"><strong>الاسم في النسخة</strong><p>${esc(incoming.profile.name) || 'غير مسجل'}</p></div><div class="info-tile"><strong>القراءات</strong><p>${incoming.readings.length} قراءة</p></div><div class="info-tile"><strong>الدواء والمواعيد</strong><p>${incoming.medications.length} أدوية · ${incoming.visits.length} مواعيد</p></div><div class="info-tile"><strong>الفحوص</strong><p>${incoming.labs.length} نتائج</p></div></div><label class="checkline"><input type="checkbox" id="restoreConfirm"><span>راجعت محتوى النسخة وأريد استبدال السجل الحالي بها.</span></label><div class="form-error" id="restoreError" hidden></div>`, '<button class="btn primary" data-action="confirm-restore">استعادة هذه النسخة</button><button class="btn secondary" data-action="close-dialog">إلغاء</button>');
  }
  function converterDialog() {
    openDialog('تحويل وحدة القراءة', `<form id="converterForm"><div class="field"><label for="convertValue">القيمة</label><input id="convertValue" inputmode="decimal" required placeholder="أدخل الرقم"></div><div class="field"><label for="convertUnit">وحدته الحالية</label><select id="convertUnit"><option value="mg">mg/dL — ملغ/دل</option><option value="mmol">mmol/L — ملمول/لتر</option></select></div><div class="notice" id="convertResult" hidden></div><div class="form-error" hidden></div><button type="submit" class="btn primary full">تحويل الوحدة</button><p class="subtext" style="margin-top:12px">للتحويل التقريبي للغلوكوز: ملغ/دل ÷ 18 = ملمول/لتر. التحويل لا يفسر القراءة ولا يغير سجلك.</p></form>`);
  }
  function installDialog() {
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    openDialog('رفيقك على الشاشة الرئيسية', `<div class="notice ${installed ? '' : 'gold'}"><strong>${installed ? 'أنت تستخدم التطبيق في نافذة مستقلة' : 'تطبيق ويب قابل للتثبيت (PWA)'}</strong>يفتح كتطبيق على هاتفك بعد إضافته إلى الشاشة الرئيسية، ويعمل بلا إنترنت بعد تجهيز النسخة الأولى.</div>${installPrompt ? '<button class="btn primary full" data-action="install-now">تثبيت التطبيق الآن</button>' : ''}<ol class="install-steps"><li><span>على أندرويد: افتح الرابط في Chrome أو Samsung Internet، ثم القائمة ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span></li><li><span>على iPhone: افتحه في Safari، ثم زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</span></li><li><span>انتظر ظهور «جاهز بلا إنترنت» أعلى الصفحة. بعدها جرّب وضع الطيران وإعادة فتح التطبيق.</span></li></ol><p class="subtext">الملفات المفتوحة مباشرة من مدير الملفات لا تفعّل التثبيت أو التخزين المؤقت؛ استخدم رابط الموقع HTTPS. مواعيد الدواء والمؤقت لا يضمنان التنبيه أثناء إغلاق التطبيق.</p>`);
  }
  function moreDialog() {
    openDialog('كل ما تحتاجه', `<div class="choice-grid">${[['labs', 'الفحوص والوزن', 'flask'], ['visits', 'المواعيد والأسئلة', 'calendar'], ['reports', 'تقرير الطبيب', 'report'], ['settings', 'الملف والأهداف والنسخ', 'settings'], ['about', 'الطالبات وورقة العمل', 'book']].map(([key, label, ico]) => `<button class="choice-button" data-action="go" data-view="${key}">${icon(ico)}<strong>${label}</strong></button>`).join('')}<button class="choice-button" data-action="sos">${icon('shield')}<strong>دليل الهبوط والطوارئ</strong></button><button class="choice-button" data-action="install">${icon('phone')}<strong>تثبيت التطبيق</strong></button><button class="choice-button" data-action="converter">${icon('drop')}<strong>تحويل الوحدة</strong></button></div>`);
  }
  async function setupPWA() {
    const chip = $('#offlineStatus');
    const status = (text, cls) => { chip.className = 'status-chip ' + cls; $('span', chip).textContent = text; };
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') { status('التثبيت يحتاج رابط HTTPS', 'loading'); return; }
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      const showUpdate = () => { if (swRegistration.waiting) $('#updateNotice').hidden = false; };
      showUpdate();
      swRegistration.addEventListener('updatefound', () => {
        const worker = swRegistration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadForUpdate) location.reload(); });
      const readyRegistration = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Offline installation timeout')), 20000);
        navigator.serviceWorker.ready.then(registration => { clearTimeout(timeout); resolve(registration); }, error => { clearTimeout(timeout); reject(error); });
      });
      const worker = readyRegistration.active;
      if (!worker) throw new Error('Offline worker unavailable');
      const ready = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => reject(new Error('Offline readiness timeout')), 10000);
        channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data?.ready === true); };
        worker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
      });
      if (!ready) throw new Error('Incomplete offline cache');
      const update = () => status(navigator.onLine ? 'جاهز بلا إنترنت' : 'بلا إنترنت · يعمل محليًا', navigator.onLine ? '' : 'offline');
      window.addEventListener('online', update); window.addEventListener('offline', update); update();
    } catch { status('لم يكتمل تجهيز بلا إنترنت', 'loading'); }
  }
  function checkReminders() {
    if (!state || document.visibilityState === 'hidden') return;
    const now = C.localInput().slice(-5);
    for (const dose of todayDoses()) if (dose.time === now && !dose.taken && !notifiedDoses.has(dose.key)) {
      notifiedDoses.add(dose.key); toast(`تذكير ${demo ? 'تجريبي ' : ''}بالموعد المسجل: ${dose.name}. راجع وصفتك؛ لا يقرر التطبيق تناول الجرعة.`);
    }
  }
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-action]'); if (!el || el.disabled) return;
    const action = el.dataset.action, id = el.dataset.id;
    try {
      switch (action) {
        case 'close-dialog': closeDialog(); break;
        case 'settings': closeDialog(); go('settings'); break;
        case 'about': closeDialog(); go('about'); break;
        case 'report': closeDialog(); go('reports'); break;
        case 'go': closeDialog(); go(el.dataset.view); break;
        case 'more': moreDialog(); break;
        case 'add-reading': readingDialog(); break;
        case 'edit-reading': { const r = S().readings.find(r => r.id === id); if (r) readingDialog(r); break; }
        case 'reading-unit': {
          const value = C.number($('#readingValue').value);
          const next = el.dataset.unit;
          if (Number.isFinite(value)) {
            if (readingDraftMg === null || value !== C.number(readingDisplayValue)) readingDraftMg = C.toMg(value, activeReadingUnit);
            readingDisplayValue = String(C.fromMg(readingDraftMg, next));
            $('#readingValue').value = readingDisplayValue;
          } else { readingDraftMg = null; readingDisplayValue = ''; }
          activeReadingUnit = next; $('#readingUnitLabel').textContent = next === 'mmol' ? 'mmol/L' : 'mg/dL';
          $$('#readingForm [data-action="reading-unit"]').forEach(b => b.classList.toggle('active', b.dataset.unit === next)); break;
        }
        case 'delete-reading': confirmDialog('حذف القراءة؟', 'ستحذف هذه القراءة من سجل هذا الجهاز. يمكنك إلغاء العملية الآن.', 'confirm-delete-reading', id); break;
        case 'confirm-delete-reading': if (await mutate(s => { s.readings = s.readings.filter(r => r.id !== id); }, 'حُذفت القراءة')) closeDialog(); break;
        case 'chart-days': chartDays = Number(el.dataset.days); render(); break;
        case 'log-prev': logPage--; $('#logResults').innerHTML = logTable(); break;
        case 'log-next': logPage++; $('#logResults').innerHTML = logTable(); break;
        case 'csv': download(C.csv(selectedLogs(), S().profile.unit, !!demo), `rafiq-${demo ? 'demo-' : ''}readings-${C.dayKey()}.csv`, 'text/csv;charset=utf-8'); break;
        case 'report-csv': download(C.csv(reportRows(), S().profile.unit, !!demo), `rafiq-${demo ? 'demo-' : ''}report-${C.dayKey()}.csv`, 'text/csv;charset=utf-8'); break;
        case 'add-med': medicationDialog(); break;
        case 'edit-med': medicationDialog(S().medications.find(m => m.id === id)); break;
        case 'delete-med': confirmDialog('حذف الدواء من الجدول؟', 'هذه العملية تحذف التذكير المسجل في التطبيق، ولا تعني إيقاف الدواء الموصوف. قرارات العلاج مع الطبيب.', 'confirm-delete-med', id); break;
        case 'confirm-delete-med': if (await mutate(s => { s.medications = s.medications.filter(m => m.id !== id); for (const k of Object.keys(s.doseLog)) if (k.startsWith(id + '|')) delete s.doseLog[k]; }, 'حُذف من الجدول')) closeDialog(); break;
        case 'toggle-dose': { const key = `${id}|${C.dayKey()}|${el.dataset.time}`; await mutate(s => { if (s.doseLog[key]) delete s.doseLog[key]; else s.doseLog[key] = true; }, 'حُدّث سجل التناول حسب إدخالك'); break; }
        case 'add-lab': labDialog(el.dataset.kind || 'a1c'); break;
        case 'delete-lab': confirmDialog('حذف النتيجة؟', 'ستحذف هذه النتيجة المسجلة من التطبيق.', 'confirm-delete-lab', id); break;
        case 'confirm-delete-lab': if (await mutate(s => { s.labs = s.labs.filter(l => l.id !== id); })) closeDialog(); break;
        case 'add-visit': visitDialog(); break;
        case 'edit-visit': visitDialog(S().visits.find(v => v.id === id)); break;
        case 'delete-visit': confirmDialog('حذف الموعد؟', 'هذا يحذف الموعد من التطبيق فقط؛ لا يلغي حجز العيادة أو موعد التقويم الذي صدّرته.', 'confirm-delete-visit', id); break;
        case 'confirm-delete-visit': if (await mutate(s => { s.visits = s.visits.filter(v => v.id !== id); })) closeDialog(); break;
        case 'calendar': calendarExport(id); break;
        case 'learn-category': learnCategory = el.dataset.category; render(); break;
        case 'article': articleDialog(id); break;
        case 'sos': sosDialog(el.dataset.tab || 'low'); break;
        case 'start-timer': startTimer(); break;
        case 'cancel-timer': timerDeadline = 0; timerAnnounced = false; try { localStorage.removeItem(timerKey); } catch {} updateTimer(); if ($('#sosTimer')) $('#sosTimer').textContent = '15:00'; toast('أُلغي المؤقت فقط؛ راجع خطة القياس.'); break;
        case 'print-report': printReport(); break;
        case 'converter': converterDialog(); break;
        case 'backup': backupDialog(); break;
        case 'restore': if (demo) { toast('اخرج من العرض التجريبي قبل استعادة بيانات حقيقية.', true); break; } $('#restoreFile').value = ''; $('#restoreFile').click(); break;
        case 'confirm-restore': {
          if (!$('#restoreConfirm').checked) { $('#restoreError').hidden = false; $('#restoreError').textContent = 'أكد مراجعة النسخة والموافقة على استبدال السجل.'; break; }
          if (!restoreCandidate) throw new Error('اختر النسخة مرة أخرى.');
          const data = C.clone(restoreCandidate); data.updatedAt = new Date().toISOString();
          await RafiqStore.save(data, true); state = data; restoreCandidate = null; $('#storageWarning').hidden = true; closeDialog(); render(); toast('استُعيدت النسخة على هذا الجهاز'); break;
        }
        case 'persist': { const granted = await RafiqStore.requestPersistence(); toast(granted ? 'وافق المتصفح على طلب الاحتفاظ بالتخزين؛ استمر بالنسخ الاحتياطي.' : 'لم يمنح المتصفح التخزين الدائم. احتفظ بنسخة احتياطية.'); break; }
        case 'clear-data': openDialog('حذف بيانات هذا التطبيق', `<p>ستحذف جميع القراءات والأدوية والمواعيد والملف من هذا التطبيق على هذا المتصفح. نزّل نسخة احتياطية إن كنت تحتاجها.</p><form id="clearForm"><div class="field" style="margin-top:16px"><label for="clearWord">اكتب كلمة «حذف» للتأكيد</label><input id="clearWord" name="word" required autocomplete="off"></div><div class="form-error" hidden></div><button type="submit" class="btn danger full">حذف السجل بالكامل</button></form>`); break;
        case 'demo': demo = C.demoState(); closeDialog(); view = 'dashboard'; if (location.hash !== '#dashboard') location.hash = 'dashboard'; render(); toast('عرض افتراضي منفصل؛ سجلك الحقيقي لم يتغير.'); break;
        case 'exit-demo': demo = null; render(); toast('عدت إلى سجلك المحفوظ'); break;
        case 'install': installDialog(); break;
        case 'install-now': if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; closeDialog(); } break;
        case 'apply-update': if (swRegistration?.waiting) { reloadForUpdate = true; swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); } break;
      }
    } catch (e) { toast(e.message || 'لم تكتمل العملية.', true); }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('circle[data-action]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  document.addEventListener('change', async event => {
    const el = event.target;
    if (el.dataset.habit) { const key = el.dataset.habit, checked = el.checked; await mutate(s => { const set = new Set(s.habits[C.dayKey()] || []); if (checked) set.add(key); else set.delete(key); s.habits[C.dayKey()] = [...set]; }, 'حُفظت علامة التذكّر'); }
    else if (el.id === 'logDays' || el.id === 'logContext' || el.id === 'logStatus') { logDays = $('#logDays').value; logContext = $('#logContext').value; logStatus = $('#logStatus').value; logPage = 1; $('#logResults').innerHTML = logTable(); }
    else if (el.id === 'reportDays') { reportDays = el.value; render(); }
    else if (el.id === 'reportStart' || el.id === 'reportEnd') { reportStart = $('#reportStart').value; reportEnd = $('#reportEnd').value; if (reportStart > reportEnd) toast('تاريخ البداية يجب أن يسبق النهاية.', true); $('#reportBody').innerHTML = reportBody(); }
    else if (el.id === 'encryptBackup') { $('#backupPasswordFields').hidden = !el.checked; $('#plainBackupNotice').hidden = el.checked; }
    else if (el.id === 'restoreFile' && el.files[0]) {
      try {
        const file = el.files[0]; if (file.size > 10 * 1024 * 1024) throw new Error('الملف أكبر من 10 ميغابايت.');
        const parsed = JSON.parse(await file.text());
        if (parsed.encrypted === true) {
          backupCandidate = parsed;
          openDialog('فك النسخة المشفرة', '<form id="unlockForm"><div class="field"><label for="unlockPassword">كلمة مرور النسخة</label><input id="unlockPassword" name="password" type="password" autocomplete="current-password" required></div><div class="form-error" hidden></div><button class="btn primary full" type="submit">فك التشفير ومعاينة</button></form>');
        } else previewRestore(parsed);
      } catch (e) { toast(e instanceof SyntaxError ? 'الملف ليس JSON صالحًا.' : e.message, true); }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'logSearch') { logSearch = event.target.value; logPage = 1; clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { if ($('#logResults')) $('#logResults').innerHTML = logTable(); }, 180); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target; event.preventDefault();
    const data = new FormData(form), button = $('button[type="submit"]', form);
    if (button) button.disabled = true;
    try {
      if (form.id === 'readingForm') {
        const r = C.validateReading({ value: data.get('value'), unit: activeReadingUnit, at: data.get('at'), context: data.get('context'), note: data.get('note'), symptoms: data.get('symptoms') }, editingId);
        if (readingDraftMg !== null && C.number(data.get('value')) === C.number(readingDisplayValue)) r.mg = readingDraftMg;
        const ok = await mutate(s => { const i = s.readings.findIndex(x => x.id === r.id); if (i >= 0) s.readings[i] = r; else s.readings.push(r); });
        if (ok) {
          closeDialog();
          if (r.mg < 70 || r.mg >= 300) {
            const historical = Date.now() - new Date(r.at) > 60 * 60000;
            openDialog(r.mg < 70 ? 'حُفظت قراءة منخفضة' : 'حُفظت قراءة مرتفعة جدًا', `<div class="notice danger"><strong>${val(r.mg)} ${unitAr()} · ${stamp(r.at)}</strong>${historical ? 'هذه قراءة سابقة ولا تثبت مستوى السكر الآن. راجع تكرارها مع فريقك.' : r.mg < 70 ? 'إذا كانت هذه حالتك الآن فاتبع خطة الهبوط فورًا. إذا تأثر الوعي أو تعذر البلع اطلب الطوارئ ولا تعطِ طعامًا أو شرابًا بالفم.' : 'إذا استمر السكر عند 300 أو أكثر، أو ظهر قيء أو صعوبة تنفس أو رائحة نفس فاكهية، اطلب الطوارئ فورًا. لا تنتظر الرقم إذا ظهرت علامات الخطر.'}</div>`, `<button class="btn primary" data-action="sos" data-tab="${r.mg < 70 ? 'low' : 'high'}">افتح الدليل</button><button class="btn secondary" data-action="close-dialog">تم</button>`);
          }
        }
      } else if (form.id === 'medForm') {
        const times = String(data.get('times')).replace(/،/g, ',').split(',').map(t => t.trim());
        if (!times.length || times.length > 8 || times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('استخدم مواعيد صحيحة بصيغة 24 ساعة، مثل 08:00, 20:00.');
        const m = { id: editingId || C.id(), name: String(data.get('name')).trim(), dose: String(data.get('dose')).trim(), note: String(data.get('note')).trim(), times: [...new Set(times)].sort() };
        if (!m.name || !m.dose) throw new Error('أدخل اسم الدواء ونص الجرعة كما في الوصفة.');
        if (await mutate(s => { const i = s.medications.findIndex(x => x.id === m.id); if (i >= 0) s.medications[i] = m; else s.medications.push(m); })) closeDialog();
      } else if (form.id === 'labForm') {
        const kind = data.get('kind'), value = C.number(data.get('value')), at = new Date(`${data.get('at')}T12:00:00`);
        if (!['a1c', 'weight'].includes(kind) || !Number.isFinite(value) || value <= 0 || value > (kind === 'a1c' ? 25 : 500)) throw new Error('أدخل قيمة صحيحة لنوع النتيجة المحدد.');
        if (!Number.isFinite(at.getTime()) || C.dayKey(at) > C.dayKey()) throw new Error('اختر تاريخ قياس صحيحًا لا يتجاوز اليوم.');
        // Store a measured date at midnight to avoid a future timestamp when recorded in the morning.
        at.setHours(0, 0, 0, 0);
        const l = { id: C.id(), kind, value, at: at.toISOString(), note: String(data.get('note')).trim() };
        if (await mutate(s => s.labs.push(l))) closeDialog();
      } else if (form.id === 'visitForm') {
        const at = new Date(String(data.get('at'))), title = String(data.get('title')).trim();
        if (!title || !Number.isFinite(at.getTime())) throw new Error('أدخل عنوانًا وتاريخًا صحيحين.');
        const v = { id: editingId || C.id(), title, at: at.toISOString(), place: String(data.get('place')).trim(), note: String(data.get('note')).trim() };
        if (await mutate(s => { const i = s.visits.findIndex(x => x.id === v.id); if (i >= 0) s.visits[i] = v; else s.visits.push(v); })) closeDialog();
      } else if (form.id === 'questionsForm') {
        await mutate(s => { s.questions = String(data.get('questions')).slice(0, 5000); }, 'حُفظت أسئلتك للزيارة');
      } else if (form.id === 'settingsForm') {
        const values = Object.fromEntries(['beforeLow', 'beforeHigh', 'afterHigh', 'chartLow', 'chartHigh'].map(k => [k, C.number(data.get(k))]));
        if (Object.values(values).some(v => !Number.isFinite(v)) || values.beforeLow < 70 || values.beforeHigh <= values.beforeLow || values.beforeHigh > 400 || values.afterHigh < 80 || values.afterHigh > 500 || values.chartLow < 70 || values.chartHigh <= values.chartLow || values.chartHigh > 600) throw new Error('راجع الأرقام: حد قبل الوجبة الأعلى أكبر من الأدنى، والأدنى لا يقل عن 70. نطاق الرسم يبدأ من 70 أو أكثر وينتهي فوق بدايته حتى 600.');
        const profile = { ...S().profile, ...values, name: String(data.get('name')).trim().slice(0, 60), unit: data.get('unit'), type: data.get('type'), targetsConfirmed: data.get('confirmed') === 'on', emergencyPhone: String(data.get('phone')).replace(/[^\d+() -]/g, '').slice(0, 25), largeText: data.get('largeText') === 'on' };
        await mutate(s => { s.profile = profile; });
      } else if (form.id === 'converterForm') {
        const n = C.number($('#convertValue').value), u = $('#convertUnit').value, mg = C.toMg(n, u);
        if (!Number.isFinite(mg) || mg < 1 || mg > 1000) throw new Error('أدخل قيمة بين 1 و1000 ملغ/دل أو ما يعادلها.');
        const target = u === 'mg' ? 'mmol' : 'mg'; $('#convertResult').hidden = false; $('#convertResult').textContent = `${C.fromMg(mg, target)} ${target === 'mg' ? 'mg/dL — ملغ/دل' : 'mmol/L — ملمول/لتر'}`;
        $('.form-error', form)?.setAttribute('hidden', '');
      } else if (form.id === 'backupForm') {
        const encrypted = data.get('encrypt') === 'on', password = String(data.get('password'));
        if (encrypted && (password.length < 8 || password !== data.get('again'))) throw new Error('استخدم 8 أحرف على الأقل، وأدخل كلمة المرور نفسها في التأكيد.');
        const raw = { app: 'rafiq-diabetes', version: C.VERSION, exportedAt: new Date().toISOString(), demo: !!demo, data: C.clone(S()) };
        const output = encrypted ? await encryptBackup(raw, password) : raw;
        download(JSON.stringify(output, null, 2), `rafiq-${demo ? 'demo-' : ''}backup-${C.dayKey()}${encrypted ? '-encrypted' : ''}.json`); closeDialog(); toast('نُزّلت النسخة. احتفظ بها وبكلمة مرورها إن كانت مشفرة.');
      } else if (form.id === 'unlockForm') {
        const raw = await decryptBackup(backupCandidate, String(data.get('password'))); backupCandidate = null; previewRestore(raw);
      } else if (form.id === 'clearForm') {
        if (String(data.get('word')).trim() !== 'حذف') throw new Error('اكتب كلمة حذف لتأكيد العملية.');
        if (await mutate(s => Object.assign(s, C.defaultState()), 'حُذفت بيانات هذا التطبيق على هذا الجهاز')) { closeDialog(); go('dashboard'); }
      }
    } catch (e) { showError(form, e.message || 'تعذر إكمال العملية.'); }
    finally { if (button?.isConnected) button.disabled = false; }
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('appinstalled', () => { installPrompt = null; toast('أضيف رفيق السكري إلى تطبيقاتك'); });
  window.addEventListener('hashchange', () => { const key = location.hash.slice(1); view = Object.hasOwn(titles, key) ? key : 'dashboard'; closeDialog(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', () => { updateTimer(); checkReminders(); });
  $('#appDialog').addEventListener('click', event => { if (event.target === $('#appDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  try {
    const loaded = await RafiqStore.init(); state = loaded.state; storageMode = loaded.mode;
    if (loaded.error) { $('#storageWarning').hidden = false; $('#storageWarning').textContent = loaded.error; }
    else if (storageMode === 'localstorage') { $('#storageWarning').hidden = false; $('#storageWarning').className = 'notice gold'; $('#storageWarning').textContent = 'يُستخدم التخزين المحلي البديل لهذا المتصفح. احتفظ بنسخة احتياطية بانتظام.'; }
    const hash = location.hash.slice(1); view = Object.hasOwn(titles, hash) ? hash : 'dashboard';
    try { const deadline = Number(localStorage.getItem(timerKey)); if (deadline && deadline > Date.now() - 86400000 && deadline < Date.now() + 16 * 60000) timerDeadline = deadline; } catch {}
    $('#version').textContent = C.VERSION; $('#boot').hidden = true; $('#shell').hidden = false; fillIcons(); render();
    setInterval(updateTimer, 1000); setInterval(checkReminders, 30000); setupPWA();
    // Exposed read-only diagnostics for local test tooling, never patient records.
    window.RafiqDiagnostics = Object.freeze({ version: C.VERSION, view: () => view, demo: () => !!demo, storage: () => storageMode });
  } catch (e) { $('#boot').innerHTML = '<h1>تعذر بدء التطبيق</h1><p>أعد فتح الصفحة في متصفح حديث. لم نغيّر بياناتك المحفوظة.</p>'; }
})();
