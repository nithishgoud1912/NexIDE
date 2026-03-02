const fs = require("fs");
const path = require("path");

async function main() {
  const envPath = path.resolve(process.cwd(), ".env");
  const envPathLocal = path.resolve(process.cwd(), ".env.local");

  let apiKey = "";

  if (fs.existsSync(envPathLocal)) {
    const content = fs.readFileSync(envPathLocal, "utf8");
    const match = content.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
    if (match) apiKey = match[1].replace(/"/g, "").trim();
  }

  if (!apiKey && fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
    if (match) apiKey = match[1].replace(/"/g, "").trim();
  }

  if (!apiKey) {
    console.error("No API Key found");
    return;
  }

  console.log(`Testing API Key: ${apiKey.slice(0, 5)}...`);

  const models = ["gemini-1.5-flash", "gemini-pro"];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`\nFetching ${model}...`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello" }] }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(
          `❌ Error ${response.status}:`,
          JSON.stringify(data, null, 2),
        );
      } else {
        console.log(`✅ Success!`, JSON.stringify(data, null, 2).slice(0, 200));
        return;
      }
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  }
}

main();
