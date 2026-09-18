export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, at: Date.now(), msg: 'api viva' });
}
