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

// Main API handler for simplified RCI system
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
    const { 
      messages, 
      temperature = 0.3,
      top_p = 0.9, 
      top_k = 40, 
      max_tokens = 4096, 
      model = "deepseek" 
    } = req.body;

    // Validate required parameters
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Get API configuration
    const fireworksKey = process.env.FIREWORKS_API_KEY;
    
    if (!fireworksKey) {
      console.error('FIREWORKS_API_KEY environment variable is not set');
      return res.status(500).json({ 
        error: 'API configuration error',
        message: 'Fireworks API key not configured'
      });
    }

    // Map model names to Fireworks AI model identifiers
    let modelName;
    if (model === "qwen") {
      modelName = "accounts/fireworks/models/qwen3-30b-a3b";
    } else {
      modelName = "accounts/fireworks/models/deepseek-v3-0324";
    }

    const apiConfig = {
      url: 'https://api.fireworks.ai/inference/v1/chat/completions',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fireworksKey}`
      },
      model: modelName
    };

    console.log(`Processing request with ${model} model: ${apiConfig.model}`);

    // Call the Fireworks AI API
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: apiConfig.headers,
      body: JSON.stringify({
        model: apiConfig.model,
        messages,
        temperature: Math.min(Math.max(temperature, 0), 2.0), // Clamp between 0 and 2
        top_p,
        top_k,
        max_tokens,
        stream: false, // Simplified - no streaming for now
        presence_penalty: 0,
        frequency_penalty: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Fireworks AI API Error (${response.status}):`, errorText);
      
      let errorMessage = `Fireworks AI API error (${response.status})`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error && errorData.error.message) {
          errorMessage = errorData.error.message;
        }
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }

    // Handle successful response
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from Fireworks AI');
    }

    console.log(`Successfully processed ${model} request`);
    return res.status(200).json(data);

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      model: req.body.model || 'unknown'
    });
  }
}
