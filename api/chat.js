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
      temperature = 0.1,
      top_p = 0.9, 
      top_k = 40, 
      max_tokens = 16384, 
      stream = true, // Force streaming for a better UX
      model = "deepseek" 
    } = req.body;

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
      // Correctly use Qwen3 30B-A3B for validation and critique
      apiConfig = {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${fireworksKey}`,
          'Content-Type': 'application/json'
        },
        model: "accounts/fireworks/models/qwen3-30b-a3b"
      };
    } else {
      // Default to DeepSeek for analysis and code generation
      apiConfig = {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${fireworksKey}`,
          'Content-Type': 'application/json'
        },
        model: "accounts/fireworks/models/deepseek-coder-33b-instruct" // Using the powerful 33B Coder model
      };
    }

    // Log the model being used
    console.log(`Using model: ${apiConfig.model} for ${model} request (Stream: ${stream})`);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        res.write(chunk);
      }

      res.end();
    } else {
      // This part will likely not be used if stream is forced true, but is kept for completeness
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
