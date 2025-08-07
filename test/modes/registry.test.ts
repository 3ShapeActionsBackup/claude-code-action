import { describe, test, expect } from "bun:test";
import { getMode, isValidMode } from "../../src/modes/registry";
import { agentMode } from "../../src/modes/agent";
import { tagMode } from "../../src/modes/tag";
import { createMockContext, createMockAutomationContext } from "../mockContext";

describe("Mode Registry", () => {
  const mockContext = createMockContext({
    eventName: "issue_comment",
    payload: {
      action: "created",
      comment: {
        body: "Test comment without trigger",
      },
    } as any,
  });

  const mockWorkflowDispatchContext = createMockAutomationContext({
    eventName: "workflow_dispatch",
  });

  const mockScheduleContext = createMockAutomationContext({
    eventName: "schedule",
  });

  test("getMode auto-detects agent mode for issue_comment without trigger", () => {
    const mode = getMode(mockContext);
    // Agent mode is the default when no trigger is found
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent mode for workflow_dispatch", () => {
    const mode = getMode(mockWorkflowDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  // Removed test - explicit mode override no longer supported in v1.0

  test("getMode auto-detects agent for workflow_dispatch", () => {
    const mode = getMode(mockWorkflowDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent for schedule event", () => {
    const mode = getMode(mockScheduleContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  // Removed test - legacy mode names no longer supported in v1.0

  test("getMode auto-detects agent mode for PR opened", () => {
    const prContext = createMockContext({
      eventName: "pull_request",
      payload: { action: "opened" } as any,
      isPR: true,
    });
    const mode = getMode(prContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode uses agent mode when prompt is provided, even with @claude mention", () => {
    const contextWithPrompt = createMockContext({
      eventName: "issue_comment",
      payload: {
        action: "created",
        comment: {
          body: "@claude please help",
        },
      } as any,
      inputs: {
        prompt: "/review",
      } as any,
    });
    const mode = getMode(contextWithPrompt);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode uses tag mode for @claude mention without prompt", () => {
    const contextWithMention = createMockContext({
      eventName: "issue_comment",
      payload: {
        action: "created",
        comment: {
          body: "@claude please help",
        },
      } as any,
      inputs: {
        triggerPhrase: "@claude",
      } as any,
    });
    const mode = getMode(contextWithMention);
    expect(mode).toBe(tagMode);
    expect(mode.name).toBe("tag");
  });

  // Removed test - explicit mode override no longer supported in v1.0

  test("isValidMode returns true for all valid modes", () => {
    expect(isValidMode("tag")).toBe(true);
    expect(isValidMode("agent")).toBe(true);
  });

  test("isValidMode returns false for invalid mode", () => {
    expect(isValidMode("invalid")).toBe(false);
    expect(isValidMode("review")).toBe(false);
  });
});
