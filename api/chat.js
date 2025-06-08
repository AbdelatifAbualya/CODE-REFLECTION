import { config } from 'dotenv';
config();

// CORS headers for Vercel deployment
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight requests
function handleOptions(req, res) {
  res.setHeader('Vary', 'Origin');
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  return res.status(204).end();
}

// Main API handler
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  // Set CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, temperature = 0.2, top_p = 0.9, top_k = 40, max_tokens = 16384, stream = false, model = "deepseek" } = req.body;

    // Validate required parameters
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Get API configuration based on model
    let apiConfig;
    const fireworksKey = process.env.FIREWORKS_API_KEY;
    
    if (!fireworksKey) {
      console.error('FIREWORKS_API_KEY environment variable is not set');
      return res.status(500).json({ 
        error: 'API configuration error',
        message: 'Fireworks API key not configured'
      });
    }

    if (model === "qwen") {
      // Qwen3-30B-A3B for validation and critique
      apiConfig = {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${fireworksKey}`,
          'Content-Type': 'application/json'
        },
        model: "accounts/fireworks/models/qwen3-30b-a3b"
      };
    } else {
      // Default to DeepSeek V3-0324 for analysis and code generation
      apiConfig = {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${fireworksKey}`,
          'Content-Type': 'application/json'
        },
        model: "accounts/fireworks/models/deepseek-v3-0324"
      };
    }

    // Call the Fireworks API
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: apiConfig.headers,
      body: JSON.stringify({
        model: apiConfig.model,
        messages,
        temperature: Math.min(temperature, 1.0),
        top_p,
        top_k,
        max_tokens,
        stream,
        presence_penalty: 0,
        frequency_penalty: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}):`, errorText);
      throw new Error(`Fireworks API error (${response.status}): ${errorText}`);
    }

    // Handle streaming responses
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        res.write(chunk);
      }

      res.end();
    } else {
      // Return regular JSON response
      const data = await response.json();
      return res.status(200).json(data);
    }

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
