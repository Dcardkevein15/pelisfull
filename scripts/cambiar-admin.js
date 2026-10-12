/* ═══ Cambiar la frase maestra del admin ═══
   El sistema usa SHA-256: la frase "xstream-jefe-2026" se convierte en un
   hash que vive en auth.js (CONFIG.adminHash). Para cambiarla:

   1. Ejecuta este script con la nueva frase
   2. Copia el hash resultante
   3. Pégalo en auth.js línea 30: adminHash: 'NUEVO_HASH'
   4. Despliega

   ⚠️ La frase maestra SO controla quién ES admin (puede publicar el
   catálogo). No está relacionada con el token de GitHub (que es la
   credencial para ESCRIBIR en el repo). Son dos cosas separadas.       */
const crypto = require('crypto');
const frase = process.argv[2];
if (!frase) { console.log('Uso: node cambiar-admin.js "nueva-frase-secreta"'); process.exit(1); }
const hash = crypto.createHash('sha256').update(frase.trim()).digest('hex');
console.log('Frase:', frase.trim());
console.log('SHA-256:', hash);
console.log('');
console.log('Pega esto en auth.js línea 30:');
console.log(`  adminHash: '${hash}',`);
