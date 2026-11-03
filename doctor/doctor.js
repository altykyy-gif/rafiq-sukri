(function () {
  'use strict';
  const C = RafiqCore, T = RafiqTriage, rows = [], $ = id => document.getElementById(id);
  const LABEL = { high: 'أولوية عالية', medium: 'متابعة', low: 'مستقر وفق القواعد' };
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function render() {
    const body = $('rows'); body.replaceChildren();
    T.sortPatients(rows).forEach(r => {
      const tr = el('tr'); tr.className = r.level;
      [r.name, LABEL[r.level], r.reasons.join('، '), String(r.stats.count), r.stats.ratio === null ? '—' : r.stats.ratio + '%'].forEach(v => tr.appendChild(el('td', v)));
      body.appendChild(tr);
    });
    $('empty').hidden = rows.length > 0; $('tbl').hidden = rows.length === 0;
  }
  $('files').addEventListener('change', async e => {
    const msgs = $('msgs'); msgs.replaceChildren();
    for (const f of e.target.files) {
      try {
        if (f.size > 20e6) throw new Error('الملف كبير جدًا.');
        const state = C.validateBackup(JSON.parse(await f.text()));
        const t = T.triage(state, C);
        rows.push({ name: state.profile.name || f.name, ...t });
      } catch (err) { msgs.appendChild(el('p', `${f.name}: تعذرت القراءة. تأكد أنها نسخة غير مشفرة من رفيق السكري. (${err.message})`, 'err')); }
    }
    e.target.value = ''; render();
  });
  $('clear').addEventListener('click', () => { rows.length = 0; $('msgs').replaceChildren(); render(); });
})();
