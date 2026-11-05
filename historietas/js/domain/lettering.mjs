/* lettering.mjs — globos de diálogo con dueño. Overlay HTML determinista. */

const MAX_BUBBLES = 2;
const MAX_LEN = 220;

export function extractDialogues(texto, max = MAX_BUBBLES) {
  const t = String(texto || '');
  if (!t) return [];
  const out = [];
  const re = /[«""]([^«»""]{2,400})[»""]|"([^"]{2,400})"/g;
  let m;
  while ((m = re.exec(t)) && out.length < max) {
    const raw = (m[1] ?? m[2] ?? '').trim().replace(/\s+/g, ' ');
    if (raw.length >= 2) out.push(raw.length > MAX_LEN ? raw.slice(0, MAX_LEN - 1) + '…' : raw);
  }
  return out;
}

export function dialogosDePanel(para, presentes = []) {
  const pv = para?.panelVisual;
  const atribuidos = Array.isArray(pv?.dialogo) && pv.dialogo.length
    ? pv.dialogo.map((d) => ({ personaje: String(d?.personaje || '').trim(), linea: String(d?.linea || '').trim() })).filter((d) => d.linea).slice(0, MAX_BUBBLES)
    : extractDialogues(para?.texto).map((linea, i) => ({ personaje: presentes[i % Math.max(1, presentes.length)] || '', linea }));
  return atribuidos.map((d, i) => ({ ...d, lado: i % 2 ? 'der' : 'izq' }));
}
