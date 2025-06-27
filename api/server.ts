server_ts_content = '''import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const handler = createMcpHandler((server) => {
  // Web Search Tool
  server.tool(
    "web_search", 
    { 
      query: z.string().describe("Search query to find information on the web"),
      max_results: z.number().optional().default(5).describe("Maximum number of search results")
    }, 
    async ({ query, max_results }) => {
      try {
        const tavily_key = process.env.TAVILY_API_KEY;
        if (!tavily_key) {
          return {
            content: [{ type: "text", text: "Web search unavailable: TAVILY_API_KEY not configured" }]
          };
        }

        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tavily_key}`
          },
          body: JSON.stringify({
            query,
            max_results,
            search_depth: "basic",
            include_domains: [],
            exclude_domains: []
          })
        });

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          return {
            content: [{ type: "text", text: `No search results found for: ${query}` }]
          };
        }

        const results = data.results.map((result: any) => 
          `**${result.title}**\\n${result.content}\\nSource: ${result.url}`
        ).join("\\n\\n");

        return {
          content: [{ type: "text", text: `Search results for "${query}":\\n\\n${results}` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Search error: ${error.message}` }]
        };
      }
    }
  );

  // Current Time Tool
  server.tool(
    "current_time",
    { 
      timezone: z.string().optional().default("UTC").describe("Timezone for the current time")
    },
    async ({ timezone }) => {
      try {
        const now = new Date();
        const timeString = timezone === "UTC" 
          ? now.toISOString()
          : now.toLocaleString("en-US", { timeZone: timezone });
        
        return {
          content: [{ 
            type: "text", 
            text: `Current time (${timezone}): ${timeString}` 
          }]
        };
      } catch (error) {
        return {
          content: [{ 
            type: "text", 
            text: `Current time (UTC): ${new Date().toISOString()}` 
          }]
        };
      }
    }
  );

  // Calculator Tool
  server.tool(
    "calculate",
    { 
      expression: z.string().describe("Mathematical expression to evaluate (e.g., '2 + 2', '(5 * 3) + 1')")
    },
    async ({ expression }) => {
      try {
        // Basic safety check - only allow numbers, operators, parentheses, and spaces
        if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
          return {
            content: [{ type: "text", text: "Error: Invalid characters in mathematical expression" }]
          };
        }

        // Use Function constructor for safe evaluation
        const result = Function('"use strict"; return (' + expression + ')')();
        
        if (typeof result !== 'number' || !isFinite(result)) {
          return {
            content: [{ type: "text", text: "Error: Result is not a valid number" }]
          };
        }

        return {
          content: [{ type: "text", text: `${expression} = ${result}` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Calculation error: ${error.message}` }]
        };
      }
    }
  );

  // Text Analysis Tool
  server.tool(
    "text_analysis",
    {
      text: z.string().describe("Text to analyze"),
      analysis_type: z.enum(["word_count", "character_count", "sentiment", "summary"]).describe("Type of analysis to perform")
    },
    async ({ text, analysis_type }) => {
      try {
        switch (analysis_type) {
          case "word_count":
            const words = text.trim().split(/\\s+/).length;
            return {
              content: [{ type: "text", text: `Word count: ${words}` }]
            };
          
          case "character_count":
            return {
              content: [{ type: "text", text: `Character count: ${text.length} (including spaces)` }]
            };
          
          case "sentiment":
            // Simple sentiment analysis based on keywords
            const positiveWords = ["good", "great", "excellent", "amazing", "wonderful", "fantastic", "love", "like", "happy", "positive"];
            const negativeWords = ["bad", "terrible", "awful", "hate", "dislike", "sad", "negative", "disappointed", "angry"];
            
            const lowerText = text.toLowerCase();
            const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
            const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
            
            let sentiment = "neutral";
            if (positiveCount > negativeCount) sentiment = "positive";
            else if (negativeCount > positiveCount) sentiment = "negative";
            
            return {
              content: [{ type: "text", text: `Sentiment analysis: ${sentiment} (positive: ${positiveCount}, negative: ${negativeCount})` }]
            };
          
          case "summary":
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const summary = sentences.length > 3 ? sentences.slice(0, 2).join(". ") + "..." : text;
            return {
              content: [{ type: "text", text: `Summary: ${summary}` }]
            };
          
          default:
            return {
              content: [{ type: "text", text: "Unknown analysis type" }]
            };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Analysis error: ${error.message}` }]
        };
      }
    }
  );

  // Keep original echo tool for testing
  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }],
  }));
});

export { handler as GET, handler as POST, handler as DELETE };'''

with open('server.ts', 'w') as f:
    f.write(server_ts_content)

print("Created updated server.ts")
