// Pure helpers shared by the UI and the Node tests (no DOM access in this file).

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape user data before putting it into HTML.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Lowercase, trim, collapse whitespace.
export function normalise(value) {
  return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Classic Levenshtein distance (two-row DP).
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Practice answer check (handoff section 2, tab 3).
// mode 'all'  = Dutch word typed from the translation, optional leading de/het.
// mode 'art'  = only 'de' or 'het' accepted, compared with the word's article.
// Returns { counted, correct, message }. counted=false means the answer is not recorded.
export function checkAnswer(word, input, mode) {
  const norm = normalise(input);
  const target = normalise(word.nl);
  const article = word.article || '';
  const right = article ? `${article} ${word.nl}` : word.nl;

  if (mode === 'art') {
    if (norm !== 'de' && norm !== 'het') {
      return { counted: false, correct: false, message: 'Напиши лише de або het' };
    }
    if (norm === article) return { counted: true, correct: true, message: '✓ Правильно' };
    return { counted: true, correct: false, message: `✗ Правильно: ${right}` };
  }

  // Exact match without any article handling first, so expressions starting with de/het still work.
  if (norm === target) return { counted: true, correct: true, message: '✓ Правильно' };

  // Optional leading article in the typed answer.
  const m = norm.match(/^(de|het) (.+)$/);
  const typedArticle = m ? m[1] : '';
  const rest = m ? m[2] : norm;

  if (rest === target) {
    if (typedArticle && typedArticle !== article) {
      const rightArticle = article || 'без артикля';
      return {
        counted: true,
        correct: false,
        message: `Слово вірно, але артикль: ✗ → ✓ (${typedArticle} → ${rightArticle})`,
      };
    }
    return { counted: true, correct: true, message: '✓ Правильно' };
  }

  if (levenshtein(rest, target) <= 1) {
    return { counted: true, correct: false, message: `Майже, перевір літери. Правильно: ${right}` };
  }
  return { counted: true, correct: false, message: `✗ Правильно: ${right}` };
}

// Inline rule: escape first, then **x** -> <b>x</b>. Nothing else.
function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// Table row: "| a | b |" -> ['a', 'b'] (leading and trailing empty cell dropped).
function splitRow(line) {
  const inner = line.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(cell => cell.trim());
}

function renderTable(lines) {
  const rows = lines
    .map(splitRow)
    .filter(cells => !cells.every(c => /^:?-+:?$/.test(c)));   // drop |---|---| separator rows
  if (!rows.length) return '';
  const [head, ...body] = rows;
  const thead = `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="scroll"><table>${thead}${tbody}</table></div>`;
}

function renderBlock(lines) {
  if (lines.every(l => l.startsWith('|'))) return renderTable(lines);
  if (lines.every(l => l.startsWith('- '))) {
    return `<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
  }
  if (lines.every(l => l.startsWith('>'))) {
    return `<div class="ex">${lines.map(l => inline(l.slice(1).replace(/^ /, ''))).join('<br>')}</div>`;
  }
  return `<p>${lines.map(inline).join('<br>')}</p>`;
}

// Rule body mini-markdown -> HTML (handoff section 1.4).
export function renderRuleBody(body) {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '')
    .split(/\n\s*\n/)
    .filter(block => block.trim() !== '')
    .map(block => renderBlock(block.split('\n')))
    .join('');
}
