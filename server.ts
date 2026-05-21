import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase request size limits for handling large base64 images
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Initialize Gemini SDK with telemetry header
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI features might fail.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const ai = getGeminiClient();

// API endpoint to analyze the image and find distracting/unwanted items with their 2D bounding boxes (normalized to [0, 1000])
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({ error: "Gemini API client is not configured. Please supply a GEMINI_API_KEY." });
    }

    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 data in request body." });
    }

    // Prepare image for Gemini multimodal input
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      },
    };

    const prompt = `Analyze this image in detail and identify distracting, unwanted, or isolated objects that a user might want to remove using a Magic Eraser/healing tool (e.g., background people/photobombers, trash cans, wires/lines, modern exit signs, clutter, logo badges, skin blemishes, floating dust, or small blemishes).
Return a JSON array of items, each with a 'label' (short 1-3 word name of the object), a 'description' (a friendly human explanation of where it is, e.g. "Person standing near the tree"), and 'box_2d' representing the approximate [ymin, xmin, ymax, xmax] box corners normalized strictly on a scale of [0, 1000] mapping the full height and width of the image.

Focus on listing 1 to 6 items that would make the photo look cleaner if erased. Return an empty array if the photo is already clean.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, prompt],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            objects: {
              type: Type.ARRAY,
              description: "List of distracting or removable objects identified in the image.",
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "A concise name of the object to erase, e.g., 'Trashcan', 'Photobomber'." },
                  description: { type: Type.STRING, description: "Brief visual description." },
                  box_2d: {
                    type: Type.ARRAY,
                    description: "Bounding box coordinates format [ymin, xmin, ymax, xmax] normalized from 0 to 1000. Examples: ymin=100 (top 10%), xmin=450 (middle left), ymax=850, xmax=550.",
                    items: { type: Type.INTEGER }
                  }
                },
                required: ["label", "description", "box_2d"]
              }
            }
          },
          required: ["objects"]
        }
      }
    });

    const resultText = response.text || "{\"objects\": []}";
    const parsedData = JSON.parse(resultText);
    res.json(parsedData);
  } catch (error: any) {
    console.error("Error analyzing image via Gemini:", error);
    res.status(500).json({ error: error.message || "An error occurred while analyzing the image." });
  }
});

// API endpoint to process user request to erase a specific typed element (e.g., "erase the black car")
app.post("/api/gemini/request-mask", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({ error: "Gemini API client is not configured." });
    }

    const { imageBase64, typedQuery } = req.body;
    if (!imageBase64 || !typedQuery) {
      return res.status(400).json({ error: "Missing imageBase64 or typedQuery." });
    }

    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      },
    };

    const prompt = `Inspect this image and locate the exact object specified by the search query: "${typedQuery}".
Find the bounding box coordinates [ymin, xmin, ymax, xmax] of this object normalized strictly on a scale of [0, 1000] mapping the full height and width of the image.

Return JSON in this format:
{
  "label": "Name of target",
  "description": "Short location statement",
  "box_2d": [ymin, xmin, ymax, xmax]
}

If you cannot find the requested object, return:
{
  "label": "",
  "description": "Object not found in image",
  "box_2d": [0, 0, 0, 0]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, prompt],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            description: { type: Type.STRING },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER }
            }
          },
          required: ["label", "description", "box_2d"]
        }
      }
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText);
    res.json(data);
  } catch (error: any) {
    console.error("Error matching query object via Gemini:", error);
    res.status(500).json({ error: error.message || "An error occurred." });
  }
});

// Start server
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Magic Eraser] Server running on http://0.0.0.0:${PORT} (Express + Vite)`);
  });
}

startServer();
