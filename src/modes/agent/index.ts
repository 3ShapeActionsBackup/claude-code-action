import * as core from "@actions/core";
import { mkdir, writeFile } from "fs/promises";
import type { Mode, ModeOptions, ModeResult } from "../types";
import type { PreparedContext } from "../../create-prompt/types";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { parseAllowedTools } from "./parse-tools";

/**
 * Agent mode implementation.
 *
 * This mode runs whenever an explicit prompt is provided in the workflow configuration.
 * It bypasses the standard @claude mention checking and comment tracking used by tag mode,
 * providing direct access to Claude Code for automation workflows.
 */
export const agentMode: Mode = {
  name: "agent",
  description: "Direct automation mode for explicit prompts",

  shouldTrigger(context) {
    // Only trigger when an explicit prompt is provided
    return !!context.inputs?.prompt;
  },

  prepareContext(context) {
    // Agent mode doesn't use comment tracking or branch management
    return {
      mode: "agent",
      githubContext: context,
    };
  },

  getAllowedTools() {
    return [];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return false;
  },

  async prepare({ context, githubToken }: ModeOptions): Promise<ModeResult> {
    // Create prompt directory
    await mkdir(`${process.env.RUNNER_TEMP}/claude-prompts`, {
      recursive: true,
    });

    // Write the prompt file - use the user's prompt directly
    const promptContent =
      context.inputs.prompt ||
      `Repository: ${context.repository.owner}/${context.repository.repo}`;

    await writeFile(
      `${process.env.RUNNER_TEMP}/claude-prompts/claude-prompt.txt`,
      promptContent,
    );

    // Parse allowed tools from user's claude_args
    const userClaudeArgs = process.env.CLAUDE_ARGS || "";
    const allowedTools = parseAllowedTools(userClaudeArgs);

    // Detect current branch from GitHub environment
    const currentBranch =
      process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "main";

    // Get our GitHub MCP servers config
    const ourMcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: currentBranch,
      baseBranch: context.inputs.baseBranch || "main",
      claudeCommentId: undefined, // No tracking comment in agent mode
      allowedTools,
      context,
    });

    // Build final claude_args with multiple --mcp-config flags
    let claudeArgs = "";

    // Add our GitHub servers config if we have any
    const ourConfig = JSON.parse(ourMcpConfig);
    if (ourConfig.mcpServers && Object.keys(ourConfig.mcpServers).length > 0) {
      const escapedOurConfig = ourMcpConfig.replace(/'/g, "'\\''");
      claudeArgs = `--mcp-config '${escapedOurConfig}'`;
    }

    // Add user's MCP_CONFIG env var as separate --mcp-config
    const userMcpConfig = process.env.MCP_CONFIG;
    if (userMcpConfig?.trim()) {
      const escapedUserConfig = userMcpConfig.replace(/'/g, "'\\''");
      claudeArgs = `${claudeArgs} --mcp-config '${escapedUserConfig}'`.trim();
    }

    // Append user's claude_args (which may have more --mcp-config flags)
    claudeArgs = `${claudeArgs} ${userClaudeArgs}`.trim();

    core.setOutput("claude_args", claudeArgs);

    return {
      commentId: undefined,
      branchInfo: {
        baseBranch: context.inputs.baseBranch || "main",
        currentBranch,
        claudeBranch: undefined,
      },
      mcpConfig: ourMcpConfig,
    };
  },

  generatePrompt(context: PreparedContext): string {
    // Agent mode uses prompt field
    if (context.prompt) {
      return context.prompt;
    }

    // Minimal fallback - repository is a string in PreparedContext
    return `Repository: ${context.repository}`;
  },

  getSystemPrompt() {
    // Agent mode doesn't need additional system prompts
    return undefined;
  },
};
