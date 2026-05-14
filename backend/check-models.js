require("dotenv").config();

const apiKey = process.env.GEMINI_API_KEY;

fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  .then((res) => res.json())
  .then((data) => {
    data.models.forEach((model) => {
      console.log(model.name, "→", model.supportedGenerationMethods);
    });
  })
  .catch((err) => console.error("Error:", err));