(function () {
  'use strict';
  const A = RafiqAssistant, cards = RafiqContent.cards, out = document.getElementById('out');
  const MSG = {
    emergency: 'هذا قد يكون طارئًا. اتصل بالإسعاف أو اذهب لأقرب طوارئ الآن، ولا تنتظر ردًا من التطبيق.',
    dosing: 'لا يقدم التطبيق جرعات ولا تعديلًا للأدوية. راجع طبيبك أو الصيدلي.',
    none: 'لم أجد بطاقة مناسبة لسؤالك. جرّب كلمات أخرى أو اسأل فريقك الطبي.',
    empty: 'اكتب سؤالك أولًا.'
  };
  function show(text, cls) { const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; out.appendChild(p); }
  document.getElementById('f').addEventListener('submit', e => {
    e.preventDefault(); out.replaceChildren();
    const res = A.answer(document.getElementById('q').value, cards);
    if (res.kind !== 'found') return show(MSG[res.kind], res.kind === 'emergency' ? 'alert' : '');
    res.results.forEach(({ card }) => {
      const s = document.createElement('section'); const h = document.createElement('h2'); h.textContent = card.title;
      const i = document.createElement('p'); i.textContent = card.intro; s.append(h, i);
      const d = document.createElement('div'); d.innerHTML = card.body; s.appendChild(d); out.appendChild(s);
    });
    show('الإجابة من بطاقات التطبيق الموثقة. افتح قسم «مكتبة العناية» لرؤية المصادر، وراجع طبيبك لقرارات علاجك.');
  });
})();
