const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { OpenAI } = require("openai");

const app = express();

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

console.log("API Key loaded:", process.env.OPENROUTER_API_KEY ? "✅ Yes" : "❌ NO KEY FOUND");

app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    console.log("Sending to OpenRouter...");

    const response = await client.chat.completions.create({
       model: "nvidia/nemotron-3-nano-30b-a3b:free",  // ✅ new  // 100% free!
      messages: [
        {
          role: "system",
          content: "You are an expert coding assistant. Help users write, fix, and understand code clearly.",
        },
        ...messages,
      ],    
    });

    const reply = response.choices[0].message.content;
    console.log("OpenRouter replied ✅");
    res.json({ reply });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => console.log("✅ Server running on port 5000"));