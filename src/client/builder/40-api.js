// src/client/builder/40-api.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  function toQuery(params){
    const u = new URLSearchParams();
    Object.entries(params || {}).forEach(([k,v]) => {
      if (v === undefined || v === null) return;
      u.append(k, String(v));
    });
    return u.toString();
  }

  async function fetchJson(url, opts){
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json() : await res.text();
    return { res, body };
  }

  NS.API = {
    async checkTitleUnique(title, excludeId){
      const qs = toQuery({ title, excludeId });
      return fetchJson(`/api/forms/check-title?${qs}`, { cache: 'no-store' });
    },
    async saveForm(payload){
      return fetchJson('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },
    async getForm(id){
      return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
    },
    async deleteForm(id){
      return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
  };
})();

