import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { agentMode } from "../../src/modes/agent";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";

describe("Agent Mode", () => {
  let mockContext: GitHubContext;
  let exportVariableSpy: any;
  let setOutputSpy: any;

  beforeEach(() => {
    mockContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
  });

  afterEach(() => {
    exportVariableSpy?.mockClear();
    setOutputSpy?.mockClear();
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
  });

  test("agent mode has correct properties", () => {
    expect(agentMode.name).toBe("agent");
    expect(agentMode.description).toBe(
      "Direct automation mode for explicit prompts",
    );
    expect(agentMode.shouldCreateTrackingComment()).toBe(false);
    expect(agentMode.getAllowedTools()).toEqual([]);
    expect(agentMode.getDisallowedTools()).toEqual([]);
  });

  test("prepareContext returns minimal data", () => {
    const context = agentMode.prepareContext(mockContext);

    expect(context.mode).toBe("agent");
    expect(context.githubContext).toBe(mockContext);
    // Agent mode doesn't use comment tracking or branch management
    expect(Object.keys(context)).toEqual(["mode", "githubContext"]);
  });

  test("agent mode only triggers when prompt is provided", () => {
    // Should NOT trigger for automation events without prompt
    const workflowDispatchContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    expect(agentMode.shouldTrigger(workflowDispatchContext)).toBe(false);

    const scheduleContext = createMockAutomationContext({
      eventName: "schedule",
    });
    expect(agentMode.shouldTrigger(scheduleContext)).toBe(false);

    // Should NOT trigger for entity events without prompt
    const entityEvents = [
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    entityEvents.forEach((eventName) => {
      const contextNoPrompt = createMockContext({ eventName });
      expect(agentMode.shouldTrigger(contextNoPrompt)).toBe(false);
    });

    // Should trigger for ANY event when prompt is provided
    const allEvents = [
      "workflow_dispatch",
      "schedule",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    allEvents.forEach((eventName) => {
      const contextWithPrompt =
        eventName === "workflow_dispatch" || eventName === "schedule"
          ? createMockAutomationContext({
              eventName,
              inputs: { prompt: "Do something" },
            })
          : createMockContext({
              eventName,
              inputs: { prompt: "Do something" },
            });
      expect(agentMode.shouldTrigger(contextWithPrompt)).toBe(true);
    });
  });

  test("prepare method passes through claude_args", async () => {
    // Clear any previous calls before this test
    exportVariableSpy.mockClear();
    setOutputSpy.mockClear();

    const contextWithCustomArgs = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });

    // Set CLAUDE_ARGS environment variable
    process.env.CLAUDE_ARGS = "--model claude-sonnet-4 --max-turns 10";

    const mockOctokit = {} as any;
    const result = await agentMode.prepare({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify claude_args is passed through
    expect(setOutputSpy).toHaveBeenCalledWith(
      "claude_args",
      "--model claude-sonnet-4 --max-turns 10",
    );

    // Verify return structure
    expect(result).toEqual({
      commentId: undefined,
      branchInfo: {
        baseBranch: "",
        currentBranch: "",
        claudeBranch: undefined,
      },
      mcpConfig: expect.any(String),
    });

    // Clean up
    delete process.env.CLAUDE_ARGS;
  });

  test("prepare method creates prompt file with correct content", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    // In v1-dev, we only have the unified prompt field
    contextWithPrompts.inputs.prompt = "Custom prompt content";

    const mockOctokit = {} as any;
    await agentMode.prepare({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Note: We can't easily test file creation in this unit test,
    // but we can verify the method completes without errors
    expect(setOutputSpy).toHaveBeenCalledWith("claude_args", "");
  });
});
