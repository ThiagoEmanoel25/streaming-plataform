// Adaptador D1 sobre node:sqlite. Só para rodar fora da Cloudflare (testes e container de dev).
// Em produção quem serve é o D1 de verdade; este arquivo não vai para o Worker.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const isSelect = (sql) => /^\s*select/i.test(sql);

export function makeD1(schemaPath, file = ':memory:') {
  const sqlite = new DatabaseSync(file);
  sqlite.exec(readFileSync(schemaPath, 'utf8'));
  const stmt = (sql, args) => {
    const s = sqlite.prepare(sql);
    const norm = args.map((a) => (a === undefined ? null : a === true ? 1 : a === false ? 0 : a));
    return {
      all: async () => ({ results: isSelect(sql) ? s.all(...norm).map((r) => ({ ...r })) : [], success: true }),
      first: async () => { const r = isSelect(sql) ? s.get(...norm) : null; return r ? { ...r } : null; },
      run: async () => ({ success: true, meta: { changes: Number(s.run(...norm).changes || 0) } }),
    };
  };
  return { prepare: (sql) => ({ bind: (...args) => stmt(sql, args), ...stmt(sql, []) }), _sqlite: sqlite };
}
