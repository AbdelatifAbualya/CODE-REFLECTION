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
    const { 
      messages, 
      temperature = 0.6,
      top_p = 1, 
      top_k = 40, 
      max_tokens = 4096, 
      stream = true,
      model = "deepseek" 
    } = req.body;

    // Validate required parameters
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Get API configuration based on model
    const fireworksKey = process.env.FIREWORKS_API_KEY;
    
    if (!fireworksKey) {
      console.error('FIREWORKS_API_KEY environment variable is not set');
      return res.status(500).json({ 
        error: 'API configuration error',
        message: 'Fireworks API key not configured'
      });
    }

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

    // Log the model being used
    console.log(`Using model: ${apiConfig.model} for ${model} request (Stream: ${stream})`);

    // Call the Fireworks API
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: apiConfig.headers,
      body: JSON.stringify({
        model: apiConfig.model,
        messages,
        temperature: Math.min(temperature, 2.0),
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
      
      let errorMessage = `Fireworks API error (${response.status})`;
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

    // Handle streaming responses
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (error) {
        console.error('Streaming error:', error);
      } finally {
        res.end();
      }
    } else {
      // Handle non-streaming response
      const data = await response.json();
      console.log(`Successfully processed ${model} request (non-stream)`);
      return res.status(200).json(data);
    }

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      model: req.body.model || 'unknown'
    });
  }
}
