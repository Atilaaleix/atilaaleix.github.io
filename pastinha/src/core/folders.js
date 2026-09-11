// A taxonomia do usuário: quais pastas existem, quão usadas são, e quais
// se parecem com um arquivo novo. É o "retrieval" da seção 07 do plano, na
// versão sem embedding — sobreposição de tokens, que já é surpreendentemente boa.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'Library', '.Trash', '.venv', 'venv',
  '__pycache__', 'dist', 'build', '.next', 'DerivedData', '.cache', 'Pods']);

function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokens(s) {
  return new Set(norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 2));
}

/** Varre a estrutura existente até certa profundidade. Só leitura, sempre. */
export function scanTaxonomy(roots, maxDepth = 3) {
  const folders = new Map();

  function walk(dir, depth, rootLabel) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    let fileCount = 0;
    const subdirs = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      if (e.isDirectory()) subdirs.push(e.name);
      else if (e.isFile()) fileCount++;
    }

    if (depth > 0) {
      let mtimeMs = 0;
      // Quando a pasta foi mexida por ultimo e o sinal que diz em qual projeto a
      // pessoa esta trabalhando agora. Custa um stat por pasta, nao por arquivo.
      try { mtimeMs = fs.statSync(dir).mtimeMs; } catch { /* sem permissao */ }
      folders.set(dir, {
        path: dir,
        rel: path.relative(rootLabel, dir),
        name: path.basename(dir),
        files: fileCount,
        mtimeMs,
        depth
      });
    }
    for (const sd of subdirs) walk(path.join(dir, sd), depth + 1, rootLabel);
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walk(root, 0, root);
  }
  return [...folders.values()].sort((a, b) => b.files - a.files);
}

/**
 * As N pastas mais parecidas com uma descrição. O modelo escolhe entre estas,
 * nunca entre as 200 do disco — é isso que faz um modelo de 4B funcionar.
 */
export function candidates(taxonomy, query, n = 6) {
  const q = tokens(query);
  const scored = taxonomy.map(f => {
    const ft = tokens(f.rel || f.name);
    let overlap = 0;
    for (const t of q) {
      for (const u of ft) {
        if (t === u) overlap += 2;
        else if (t.length > 3 && (u.includes(t) || t.includes(u))) overlap += 1;
      }
    }
    const popularity = Math.log10(1 + f.files) * 0.4;   // pasta usada é mais provável
    const shallow = Math.max(0, 3 - f.depth) * 0.2;      // pasta rasa é mais provável
    return { ...f, score: overlap + popularity + shallow };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, n);
}

/** Garante que a pasta de destino existe dentro da raiz permitida. */
export function ensureFolder(destRoot, relFolder) {
  const clean = relFolder.split('/').map(s => s.replace(/[^\p{L}\p{N} _.-]/gu, '').trim())
    .filter(Boolean).join('/');
  const full = path.resolve(destRoot, clean);
  if (!full.startsWith(path.resolve(destRoot))) {
    throw new Error(`Destino escapou da raiz permitida: ${relFolder}`);
  }
  fs.mkdirSync(full, { recursive: true });
  return full;
}
