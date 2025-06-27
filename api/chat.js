chat_js_content = '''module.exports = async (req, res) => {
  // Handle CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests for the main functionality
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Fireworks API key from environment variables
    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      console.error('FIREWORKS_API_KEY environment variable not set');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'API key not configured. Please check server environment variables.' 
      });
    }

    // --- ROBUSTNESS CHECK: Ensure request body exists ---
    if (!req.body) {
      console.error('Request body is missing.');
      return res.status(400).json({ 
        error: 'Bad request',
        message: 'Request body is missing or malformed.' 
      });
    }

    // Extract the request body
    const { model, messages, temperature, top_p, top_k, max_tokens, presence_penalty, frequency_penalty, stream, tools, tool_choice } = req.body;

    // --- ROBUSTNESS CHECK: Validate required fields ---
    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('Missing or invalid required fields in request:', { model: !!model, messages: !!messages, isArray: Array.isArray(messages), length: messages ? messages.length : 0 });
      return res.status(400).json({ 
        error: 'Bad request',
        message: 'Missing or invalid required fields: "model" (string) and "messages" (non-empty array) are required.' 
      });
    }

    console.log('Processing request:', { 
      model, 
      messageCount: messages.length, 
      stream: !!stream,
      toolsEnabled: !!(tools && tools.length > 0),
      temperature: temperature
    });

    // Enhanced message processing with MCP tool integration
    let enhancedMessages = [...messages];
    const lastMessage = messages[messages.length - 1];

    // Function to call MCP tools
    async function callMCPTool(toolName, parameters = {}) {
      try {
        const mcpResponse = await fetch('https://model-context-protocol-mcp-with-ver-virid.vercel.app/api/server', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Math.random().toString(36).substring(7),
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: parameters
            }
          })
        });

        if (!mcpResponse.ok) {
          throw new Error(`MCP Server error: ${mcpResponse.status}`);
        }

        const mcpData = await mcpResponse.json();
        
        if (mcpData.error) {
          throw new Error(mcpData.error.message || 'MCP tool error');
        }

        return mcpData.result?.content?.[0]?.text || 'No response from MCP tool';
      } catch (error) {
        console.error('MCP Tool Error:', error);
        return `Tool error: ${error.message}`;
      }
    }

    // Detect if we need to call MCP tools
    if (lastMessage && lastMessage.role === 'user') {
      const messageContent = lastMessage.content.toLowerCase();
      
      // Web search detection
      if (messageContent.includes('search') || messageContent.includes('find') || 
          messageContent.includes('lookup') || messageContent.includes('what is') ||
          messageContent.includes('latest') || messageContent.includes('news') ||
          messageContent.includes('current') || messageContent.includes('recent')) {
        
        // Extract search query
        let searchQuery = lastMessage.content
          .replace(/search|find|lookup|what is|latest|news|current|recent/gi, '')
          .replace(/for|about|on/gi, '')
          .trim();
        
        if (searchQuery.length > 2) {
          console.log('Calling web search with query:', searchQuery);
          const searchResult = await callMCPTool('web_search', { 
            query: searchQuery, 
            max_results: 3 
          });
          
          enhancedMessages.push({
            role: 'system',
            content: `Web Search Results: ${searchResult}`
          });
        }
      }
      
      // Time detection
      else if (messageContent.includes('time') || messageContent.includes('date') || 
               messageContent.includes('when') || messageContent.includes('now') ||
               messageContent.includes('today') || messageContent.includes('current time')) {
        
        console.log('Calling current time tool');
        const timeResult = await callMCPTool('current_time', { timezone: 'UTC' });
        
        enhancedMessages.push({
          role: 'system',
          content: `Current Time: ${timeResult}`
        });
      }
      
      // Math calculation detection
      else if (messageContent.includes('calculate') || messageContent.includes('math') ||
               messageContent.includes('compute') || /[+\\-*/=]/.test(messageContent)) {
        
        // Extract mathematical expression
        const mathMatch = lastMessage.content.match(/[\\d+\\-*/().\\s]+/);
        if (mathMatch) {
          const expression = mathMatch[0].trim();
          console.log('Calling calculator with expression:', expression);
          const calcResult = await callMCPTool('calculate', { expression });
          
          enhancedMessages.push({
            role: 'system',
            content: `Calculation Result: ${calcResult}`
          });
        }
      }
      
      // Text analysis detection
      else if (messageContent.includes('analyze') || messageContent.includes('count words') ||
               messageContent.includes('sentiment') || messageContent.includes('summarize')) {
        
        let analysisType = 'summary';
        if (messageContent.includes('word count') || messageContent.includes('count words')) {
          analysisType = 'word_count';
        } else if (messageContent.includes('character count') || messageContent.includes('count characters')) {
          analysisType = 'character_count';
        } else if (messageContent.includes('sentiment')) {
          analysisType = 'sentiment';
        }
        
        console.log('Calling text analysis with type:', analysisType);
        const analysisResult = await callMCPTool('text_analysis', { 
          text: lastMessage.content, 
          analysis_type: analysisType 
        });
        
        enhancedMessages.push({
          role: 'system',
          content: `Analysis Result: ${analysisResult}`
        });
      }
    }

    // Prepare the request to Fireworks API
    const fireworksPayload = {
      model,
      messages: enhancedMessages,
      // DeepSeek-V3-0324 optimized parameters
      temperature: temperature || 0.3,
      top_p: top_p || 0.9,
      top_k: top_k || 40,
      max_tokens: max_tokens || 8192,
      presence_penalty: presence_penalty || 0,
      frequency_penalty: frequency_penalty || 0,
      stream: stream || false
    };

    // Add tools if provided (for direct tool usage)
    if (tools && tools.length > 0) {
      fireworksPayload.tools = tools;
      if (tool_choice) {
        fireworksPayload.tool_choice = tool_choice;
      }
    }

    const fireworksHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Advanced-CoD-Studio-MCP/1.0'
    };

    // Handle streaming responses
    if (stream) {
      fireworksHeaders['Accept'] = 'text/event-stream';
      
      const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: fireworksHeaders,
        body: JSON.stringify(fireworksPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fireworks API Error (Streaming):', response.status, errorText);
        
        let errorMessage = errorText;
        try {
          const parsedError = JSON.parse(errorText);
          errorMessage = parsedError.fault?.faultstring || parsedError.message || errorText;
        } catch(e) { /* Ignore if not JSON */ }

        return res.status(response.status).json({ 
          error: 'API request failed',
          message: errorMessage 
        });
      }

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      if (!response.body) {
        return res.status(500).json({ error: 'No response body from DeepSeek-V3-0324 API' });
      }

      // Pipe the stream from Fireworks to the client
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (error) {
        console.error('Streaming error with DeepSeek-V3-0324:', error);
        res.status(500).end('Streaming interrupted');
      }

    } else {
      // Handle non-streaming responses
      const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: fireworksHeaders,
        body: JSON.stringify(fireworksPayload)
      });

      const responseBody = await response.text();
      if (!response.ok) {
        console.error('Fireworks API Error (Non-streaming):', response.status, responseBody);
        
        let errorMessage = responseBody;
        try {
          const parsedError = JSON.parse(responseBody);
          errorMessage = parsedError.fault?.faultstring || parsedError.message || responseBody;
        } catch (e) { /* Ignore if not JSON */ }
        
        return res.status(response.status).json({ 
          error: 'API request failed',
          message: errorMessage 
        });
      }

      const data = JSON.parse(responseBody);
      
      if (data.usage) {
        console.log('DeepSeek-V3-0324 Usage:', data.usage);
      }
      
      return res.status(200).json(data);
    }

  } catch (error) {
    console.error('Unhandled server error:', error);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};'''

with open('chat.js', 'w') as f:
    f.write(chat_js_content)

print("Created updated chat.js with MCP integration")
