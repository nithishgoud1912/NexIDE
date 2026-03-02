const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

async function main() {
  const envPathLocal = path.resolve(process.cwd(), ".env.local");
  const envPath = path.resolve(process.cwd(), ".env");
  let apiKey = "";

  // Try .env.local first
  if (fs.existsSync(envPathLocal)) {
    const envContent = fs.readFileSync(envPathLocal, "utf-8");
    const match = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
    if (match) {
      apiKey = match[1].replace(/"/g, "").trim();
    }
  }

  // Fallback to .env
  if (!apiKey && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
    if (match) {
      apiKey = match[1].replace(/"/g, "").trim();
    }
  }

  if (!apiKey) {
    console.error(
      "❌ Could not find GOOGLE_GENERATIVE_AI_API_KEY in .env or .env.local",
    );
    return;
  }

  console.log("🔑 Using API Key:", apiKey.slice(0, 5) + "...");

  const genAI = new GoogleGenerativeAI(apiKey);

  const candidates = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
    "gemini-pro",
    "gemini-1.0-pro",
  ];

  console.log("\n🔎 Testing models...");

  for (const modelName of candidates) {
    process.stdout.write(`Testing ${modelName}... `);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Return the word 'Pong'");
      const appResponse = await result.response;
      const text = appResponse.text();
      console.log(`✅ SUCCESS! Output: ${text.trim()}`);
      console.log(`\n🎉 RECOMMENDED MODEL: "${modelName}"`);
      return; // Exit after finding the first working model
    } catch (e) {
      console.log(`❌ FAILED`);
      console.log(`   Reason: ${e.message.split("]")[1] || e.message}`); // Clean up error message
    }
  }

  console.log(
    "\n❌ No working models found. Please check your API key permissions and region.",
  );
}

main();
