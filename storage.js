(function (root) {
  'use strict';
  const namespace = 'rafiq-diabetes-v1:' + new URL('.', location.href).pathname;
  let db = null, mode = 'memory', blocked = false, revision = null;
  async function init() {
    if ('indexedDB' in root) {
      try {
        db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(namespace, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('state');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('أغلق التبويبات الأخرى ثم أعد المحاولة.'));
        });
        db.onversionchange = () => { db.close(); db = null; blocked = true; };
        mode = 'indexeddb';
        let raw = await new Promise((resolve, reject) => { const r = db.transaction('state', 'readonly').objectStore('state').get('data'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        if (!raw) {
          let previous = null;
          try { previous = localStorage.getItem(namespace); } catch {}
          if (previous) {
            const candidate = JSON.parse(previous);
            RafiqCore.validateBackup(candidate);
            await new Promise((resolve, reject) => {
              const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'), r = store.get('data');
              r.onsuccess = () => { raw = r.result || candidate; if (!r.result) store.put(candidate, 'data'); };
              tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('تعذر نقل التخزين البديل بأمان.'));
            });
          }
        }
        revision = raw?._storageRevision || raw?.updatedAt || null;
        return { state: raw ? RafiqCore.validateBackup(raw) : RafiqCore.defaultState(), mode };
      } catch (e) {
        if (mode === 'indexeddb') { blocked = true; return { state: RafiqCore.defaultState(), mode: 'blocked', error: 'تعذر فتح بياناتك المحفوظة بأمان. لم تُستبدل. أعد فتح التطبيق أو استعد نسخة احتياطية. ' + e.message }; }
      }
    }
    try {
      localStorage.setItem(namespace + ':probe', '1'); localStorage.removeItem(namespace + ':probe');
      mode = 'localstorage'; const raw = localStorage.getItem(namespace);
      const parsed = raw ? JSON.parse(raw) : null;
      revision = parsed?._storageRevision || parsed?.updatedAt || null;
      return { state: parsed ? RafiqCore.validateBackup(parsed) : RafiqCore.defaultState(), mode };
    } catch (e) { blocked = true; return { state: RafiqCore.defaultState(), mode: 'blocked', error: 'التخزين غير متاح أو البيانات تحتاج استعادة. لن نحفظ فوق سجل غير مقروء. استخدم متصفحًا عاديًا واحتفظ بنسخة احتياطية.' }; }
  }
  async function save(state, restore = false) {
    if (blocked && !restore) throw new Error('التخزين متوقف لحماية سجل سابق. أعد فتح التطبيق أو استخدم الاستعادة.');
    const nextRevision = crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const persisted = { ...state, _storageRevision: nextRevision };
    if (mode === 'indexeddb' && db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state');
        let conflict = false;
        const get = store.get('data');
        get.onsuccess = () => {
          if (!restore && (get.result?._storageRevision || get.result?.updatedAt || null) !== revision) { conflict = true; tx.abort(); return; }
          store.put(persisted, 'data');
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error(conflict ? 'تغير السجل في نافذة أخرى. أعد فتح الصفحة قبل حفظ تعديلك حتى لا تضيع البيانات الأحدث.' : 'تعذر الحفظ. لم تُعتمد العملية.'));
      });
    } else if (mode === 'localstorage') {
      const existing = localStorage.getItem(namespace);
      const parsed = existing ? JSON.parse(existing) : null;
      if (!restore && (parsed?._storageRevision || parsed?.updatedAt || null) !== revision) throw new Error('تغير السجل في نافذة أخرى. أعد فتح التطبيق قبل الحفظ.');
      localStorage.setItem(namespace, JSON.stringify(persisted));
    }
    else throw new Error('لا يتوفر تخزين دائم. لم تُحفظ العملية.');
    blocked = false; revision = nextRevision;
  }
  async function requestPersistence() { try { return await navigator.storage?.persist?.() || false; } catch { return false; } }
  root.RafiqStore = { init, save, requestPersistence, mode: () => mode };
})(globalThis);
