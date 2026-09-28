import { ImageResponse } from '@vercel/og';

/* 🎬 Generador DINÁMICO de tarjetas para compartir (póster cinematográfico
   VERTICAL 1000×1500): póster real del título + marca X·STREAM + CTA
   «▶ VER AHORA». Lo usan como og:image las páginas b/<código> y /ver/.
   Ej: /api/og?t=Naruto&k=Cap%C3%ADtulo%205&img=https://image.tmdb.org/t/p/w780/abc.jpg */

export const config = { runtime: 'edge' };

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '<', '>': '>', '&': '&', '"': '"' }[c]));

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = esc((searchParams.get('t') || 'X·STREAM').slice(0, 64));
  const tag = esc((searchParams.get('k') || '').slice(0, 34));
  const img = searchParams.get('img') || '';
  const rate = searchParams.get('r') || '';
  const ok = /^https:\/\/image\.tmdb\.org\//.test(img) ? img : '';

  return new ImageResponse(
    (
      <div style={{
        width: '1000px', height: '1500px', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg,#0b0b14 0%,#07070d 60%,#101018 100%)',
        position: 'relative',
      }}>
        {/* póster real (la imagen de la sinopsis), GRANDE y vertical */}
        {ok ? (
          <img src={img} width="1000" height="1030" style={{ objectFit: 'cover', width: '1000px', height: '1030px', display: 'block' }} />
        ) : (
          <div style={{
            width: '1000px', height: '1030px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg,#1c1c2e,#0b0b14)', fontSize: '120px',
          }}>🎬</div>
        )}
        {/* marco de luz cinematográfico */}
        <div style={{
          position: 'absolute', top: '0', left: '0', width: '1000px', height: '1030px',
          background: 'linear-gradient(180deg, rgba(7,7,13,0) 55%, rgba(7,7,13,0.92) 100%)', display: 'flex',
        }} />
        {/* banda superior de marca */}
        <div style={{
          position: 'absolute', top: '26px', left: '0', width: '1000px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            background: 'rgba(7,7,13,0.72)', border: '2px solid rgba(216,255,62,0.65)',
            borderRadius: '999px', padding: '12px 26px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '13px', background: '#d8ff3e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#111111', fontSize: '30px', fontWeight: 900,
            }}>X</div>
            <div style={{ color: '#ffffff', fontSize: '28px', fontWeight: 900, letterSpacing: '1px' }}>
              X·STREAM <span style={{ color: '#d8ff3e' }}>·</span> <span style={{ color: '#9a9ab2', fontSize: '20px' }}>cine libre</span>
            </div>
          </div>
        </div>
        {/* mitad inferior: título + CTA espectacular */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', padding: '38px 46px 46px', position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {tag ? (
              <div style={{
                background: '#d8ff3e', color: '#111111', fontSize: '26px', fontWeight: 900,
                padding: '12px 24px', borderRadius: '999px',
              }}>{tag}</div>
            ) : null}
            {rate ? (
              <div style={{
                color: '#ffd24a', fontSize: '26px', fontWeight: 900,
                border: '2px solid rgba(255,210,74,0.5)', padding: '10px 22px', borderRadius: '999px',
              }}>★ {rate}</div>
            ) : null}
          </div>
          <div style={{
            marginTop: '26px', color: '#ffffff', fontSize: title.length > 30 ? '58px' : '72px',
            fontWeight: 900, lineHeight: '1.06', letterSpacing: '-1px',
            display: 'flex', textWrap: 'wrap',
          }}>{title}</div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: '#d8ff3e', color: '#111111', fontSize: '34px', fontWeight: 900,
              padding: '20px 34px', borderRadius: '18px',
            }}>▶ VER AHORA</div>
            <div style={{ display: 'flex', flexDirection: 'column', color: '#9a9ab2', fontSize: '23px', fontWeight: 700, lineHeight: '1.35' }}>
              <span>Gratis · En español · Sin registro</span>
              <span style={{ color: '#d8ff3e', fontSize: '21px' }}>x.yapido.click — ábrelo al instante ⚡</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1000, height: 1500 },
  );
}
