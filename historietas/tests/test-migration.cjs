// Verifica que la migración de modelos viejos → nuevos funciona
const { migrateSettings } = require("../js/core/store.mjs");
const datos = { textModel: "moonshotai/kimi-k3", nvApiKey: "test", paseImpacto: true };
const migrado = migrateSettings(datos);
console.log("ANTES: textModel =", datos.textModel);
console.log("DESPUÉS de migración:", migrado.textModel);
console.log(migrado.textModel === "moonshotai/kimi-k2.6" ? "✓ MIGRACIÓN OK" : "✗ MIGRACIÓN FALLO");
