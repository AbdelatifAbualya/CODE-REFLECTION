import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const handler = createMcpHandler((server) => {
  // Web Search Tool
  server.tool(
    "Web Search", 
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
            search_depth: "basic"
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
          `**${result.title}**\n${result.content}\nSource: ${result.url}`
        ).join("\n\n");

        return {
          content: [{ type: "text", text: `Search results for "${query}":\n\n${results}` }]
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
      expression: z.string().describe("Mathematical expression to evaluate")
    },
    async ({ expression }) => {
      try {
        if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
          return {
            content: [{ type: "text", text: "Error: Invalid characters in expression" }]
          };
        }

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

  // Keep original echo tool for testing
  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }],
  }));
});

export { handler as GET, handler as POST, handler as DELETE };
