// Test REAL de cada modelo candidato contra NVIDIA chat/completions
const fs = require("fs");
const envLine = fs.readFileSync("nimbus/.env.local", "utf8");
const KEY = envLine.match(/nvapi-[A-Za-z0-9_\-]+/)[0];
const MODELOS = [
  "moonshotai/kimi-k2.6",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "z-ai/glm-5.3",
  "z-ai/glm-5.3-flash",
  "deepseek-ai/deepseek-v4.1-flash",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "meta/llama-3.2-90b-vision-instruct",
  "mistralai/mistral-large-2-instruct",
  "minimaxai/minimax-m3.1-flash",
];
(async () => {
  console.log("Probando cada modelo con una llamada REAL de chat/completions...\n");
  const funcionan = [];
  for (const model of MODELOS) {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 5, temperature: 0 }),
        signal: AbortSignal.timeout(30000),
      });
      const t = await r.text();
      if (r.status === 200) {
        funcionan.push(model);
        console.log("✓", model, "→ 200");
      } else {
        console.log("✗", model, "→", r.status, t.slice(0, 60));
      }
    } catch (e) {
      console.log("✗", model, "→", String(e.message).slice(0, 60));
    }
  }
  console.log("\n=== MODELOS QUE FUNCIONAN ===");
  funcionan.forEach(m => console.log("  ✓", m));
})();
