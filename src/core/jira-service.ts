import { env } from "../config/env";
import { Ticket } from "./types";

export class JiraService {
  private readonly baseUrl: string;
  private readonly auth: string | null;

  constructor() {
    this.baseUrl = env.jiraHost ? `https://${env.jiraHost.replace(/\/+$/, "")}/rest/api/3` : "";
    this.auth = (env.jiraEmail && env.jiraApiToken)
      ? Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString("base64")
      : null;
  }

  private isConfigured(): boolean {
    return Boolean(this.baseUrl && this.auth);
  }

  async fetchTickets(): Promise<Ticket[]> {
    if (!this.isConfigured()) {
      return this.getMockTickets();
    }

    try {
      const jql = `project = "${env.jiraProjectKey}" AND statusCategory != Done ORDER BY created DESC`;
      const response = await fetch(`${this.baseUrl}/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50`, {
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const issues = data.issues || [];
      
      // Fetch details for each issue since /search/jql only returns IDs/keys
      const tickets = await Promise.all(
        issues.map(async (issue: any) => {
          const id = issue.key || issue.id;
          if (!id) return null;
          return this.fetchTicket(id);
        })
      );

      return tickets.filter((t): t is Ticket => t !== null);
    } catch (error) {
      console.error("Jira fetch error:", error);
      return this.getMockTickets();
    }
  }

  async fetchTicket(id: string): Promise<Ticket | null> {
    if (!this.isConfigured()) {
      return this.getMockTickets().find(t => t.id === id) || null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/issue/${id}`, {
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) return null;

      const issue = await response.json();
      return this.mapIssueToTicket(issue);
    } catch (error) {
      console.error(`Error fetching ticket ${id}:`, error);
      return null;
    }
  }

  private mapIssueToTicket(issue: any): Ticket {
    if (!issue || !issue.fields) {
      return {
        id: issue?.key || issue?.id || "UNKNOWN",
        title: "No details available",
        description: "The issue details could not be retrieved from Jira.",
        priority: "MEDIUM"
      };
    }
    return {
      id: issue.key,
      title: issue.fields.summary || "No Title",
      description: issue.fields.description 
        ? this.parseAdf(issue.fields.description)
        : "No description provided.",
      priority: (issue.fields.priority?.name || "MEDIUM").toUpperCase()
    };
  }

  /**
   * Simple parser for Jira Atlassian Document Format (ADF) to plain text.
   */
  private parseAdf(doc: any): string {
    if (typeof doc === "string") return doc;
    if (!doc || !doc.content) return "";
    
    let text = "";
    for (const block of doc.content) {
      if (block.type === "paragraph" && block.content) {
        text += block.content.map((c: any) => c.text).join("") + "\n";
      } else if (block.type === "bulletList" && block.content) {
        for (const item of block.content) {
          if (item.content) {
            text += "• " + this.parseAdf(item) + "\n";
          }
        }
      }
    }
    return text.trim();
  }

  private getMockTickets(): Ticket[] {
    return [
      {
        id: "MOCK-101",
        title: "Integrate Jira API with Nexus SDLC",
        description: "Develop the JiraService to fetch issues and map them to internal types.",
        priority: "HIGH"
      },
      {
        id: "MOCK-102",
        title: "Clean up legacy JSON ticket store",
        description: "Migrate or remove local JSON tickets once Jira is fully stable.",
        priority: "MEDIUM"
      }
    ];
  }
}
