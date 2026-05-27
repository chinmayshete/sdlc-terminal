"""Agent Loop — coordinates the autonomous agent execution, tools, permission gating, and context clarification."""
from __future__ import annotations
import json
from typing import Any, Dict, List, Literal, Tuple, Union
from .tools import run_command_tool, edit_file_tool, read_file_tool, list_dir_tool
from ..utils.llm import _call_llm_json, _use_llm
from ..config.paths import paths

SYSTEM_PROMPT = """You are Nexus, an autonomous SDLC engineering agent.
You help the user maintain, develop, test, and audit their codebase.

You have access to the following tools:
1. `read_file` (args: {"path": "file_path"}): Reads the content of a file in the workspace.
2. `list_dir` (args: {"path": "folder_path"}): Lists the contents of a directory (default ".").
3. `run_command` (args: {"cmd": "shell_command"}): Runs a command in the workspace terminal.
4. `edit_file` (args: {"path": "file_path", "content": "file_content", "action": "create"|"update"|"delete"}): Modifies a file in the workspace.
5. `create_plan` (args: {"markdown": "plan_markdown"}): Proposes a structured markdown implementation plan to the user.
6. `ask_clarification` (args: {"question": "question_text"}): Ask the user clarifying questions when information or context is missing.

Output Format:
You MUST respond with a single JSON object. Do not wrap it in markdown code blocks. The JSON must match this structure:
{
  "thought": "Your internal step-by-step reasoning about the user's request and what tool to use.",
  "tool": "read_file" | "list_dir" | "run_command" | "edit_file" | "create_plan" | "ask_clarification" | null,
  "args": { ... arguments matching the selected tool's schema ... },
  "message": "A user-facing message. Write the clarification question here if using `ask_clarification`. Write your final response or status here if tool is null."
}

Rules:
1. Proactive Context Clarification: If the user asks you to perform a task, write code, or run commands, but the request lacks context (e.g. "write tests", "implement login", "fix the error" without specifying what files to target, what frameworks are used, or detailed requirements), you MUST call the `ask_clarification` tool to ask clarifying questions. DO NOT guess or proceed with plan creation or execution.
2. Ask First Policy: Any side-effecting operations (running shell commands, modifying files, creating plans) will be approved by the user first. You declare them in your tool output, and the system will prompt the user.
3. Read Before Write: Always use `read_file` to read the target file before modifying it with `edit_file` so you know its exact content and structure.
4. Step-by-Step execution: Choose one tool at a time. After a tool executes, the system will feed the result back to you, and you can decide the next step.
"""

class AgentLoop:
    def __init__(self, history: List[Dict[str, str]] | None = None):
        self.history: List[Dict[str, str]] = history if history is not None else []
        self._ensure_system_prompt()
        self.pending_tool: Dict[str, Any] | None = None
        self.pending_tool_id: str | None = None
        self.current_turn_start_idx: int = 0

    def _ensure_system_prompt(self):
        if not self.history or self.history[0].get("role") != "system":
            import os
            from ..config.paths import paths
            sys_info = (
                f"\n\n[System Information]\n"
                f"Operating System: {'Windows' if os.name == 'nt' else 'Unix/Linux'}\n"
                f"Workspace Root Directory: {paths['root_dir']}\n"
            )
            self.history.insert(0, {"role": "system", "content": SYSTEM_PROMPT + sys_info})

    async def start_turn(self, user_message: str) -> Dict[str, Any]:
        """Starts a new agent turn with the user's prompt."""
        self.current_turn_start_idx = len(self.history)
        self.history.append({"role": "user", "content": user_message})
        return await self._next_step()

    async def resume_with_permission(self, allowed: bool) -> Dict[str, Any]:
        """Resumes the turn after the user has allowed or denied a pending tool execution."""
        if not self.pending_tool:
            return {"type": "error", "message": "No pending tool execution to resume."}

        tool = self.pending_tool.get("tool")
        args = self.pending_tool.get("args", {})
        tool_id = self.pending_tool_id

        self.pending_tool = None
        self.pending_tool_id = None

        if not allowed:
            # Inform the model that the user denied the action
            self.history.append({
                "role": "user",
                "content": f"User denied permission to execute tool '{tool}' with args: {json.dumps(args)}"
            })
            return await self._next_step()

        # Execute the tool
        result = await self._execute_tool(tool, args)
        
        # Feed the tool result back as a user message context for the next turn
        self.history.append({
            "role": "user",
            "content": f"Tool execution result for '{tool}':\n{json.dumps(result)}"
        })

        return await self._next_step()

    async def _next_step(self) -> Dict[str, Any]:
        """Runs the next iteration of the agent loop by calling the LLM."""
        if not _use_llm():
            # Mock mode fallback
            user_msg = self.history[-1]["content"] if self.history else ""
            return self._mock_respond(user_msg)

        try:
            # Call LLM JSON endpoint
            response_json = await _call_llm_json(self.history, temperature=0.2)
        except Exception as e:
            return {"type": "error", "message": f"LLM Error: {str(e)}"}

        thought = response_json.get("thought", "")
        tool = response_json.get("tool")
        args = response_json.get("args", {})
        message = response_json.get("message", "")

        # Append assistant response to memory
        self.history.append({"role": "assistant", "content": json.dumps(response_json)})

        # If a tool is requested, determine if it needs user permission
        if tool:
            if tool == "ask_clarification":
                return {
                    "type": "clarification",
                    "thought": thought,
                    "question": message or args.get("question", "Could you provide more context?"),
                    "history": self.history
                }
            
            # Read operations don't need permission
            if tool in ("read_file", "list_dir"):
                result = await self._execute_tool(tool, args)
                self.history.append({
                    "role": "user",
                    "content": f"Tool execution result for '{tool}':\n{json.dumps(result)}"
                })
                # Recurse to next step immediately
                return await self._next_step()

            # Mutating operations (run_command, edit_file, create_plan) require permission
            self.pending_tool = {"tool": tool, "args": args}
            self.pending_tool_id = f"req_{len(self.history)}"
            
            return {
                "type": "permission_request",
                "request_id": self.pending_tool_id,
                "thought": thought,
                "tool": tool,
                "args": args,
                "message": message
            }

        # No tools requested: complete turn
        return {
            "type": "response",
            "thought": thought,
            "message": message or "Task complete.",
            "history": self.history
        }

    async def _execute_tool(self, tool: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Executes a tool locally in the workspace."""
        if tool == "run_command":
            cmd = args.get("cmd", "")
            return await run_command_tool(cmd)
        elif tool == "edit_file":
            path = args.get("path", "")
            content = args.get("content", "")
            action = args.get("action", "update")
            return edit_file_tool(path, content, action)
        elif tool == "read_file":
            path = args.get("path", "")
            return read_file_tool(path)
        elif tool == "list_dir":
            path = args.get("path", ".")
            return list_dir_tool(path)
        elif tool == "create_plan":
            markdown = args.get("markdown", "")
            try:
                plan_dir = paths["root_dir"] / "tickets"
                plan_dir.mkdir(parents=True, exist_ok=True)
                plan_path = plan_dir / "agent_plan.md"
                plan_path.write_text(markdown, encoding="utf-8")
                return {"success": True, "message": f"Plan written to tickets/agent_plan.md"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": f"Unknown tool: {tool}"}

    def _mock_respond(self, prompt: str) -> Dict[str, Any]:
        """Provides a helpful mock response when Azure OpenAI credentials are not configured."""
        lower = prompt.lower().strip()
        
        # Check if they are asking to do something vague without context
        if lower in ("write tests", "implement login", "fix bug", "do task", "make changes"):
            question = f"Mock Agent: You asked to '{prompt}' without specifying files or requirements. Which files should I target, and what are the detailed requirements?"
            resp = {
                "thought": "User provided a high-level task without context. Asking clarifying questions.",
                "tool": "ask_clarification",
                "args": {"question": question},
                "message": question
            }
            self.history.append({"role": "assistant", "content": json.dumps(resp)})
            return {
                "type": "clarification",
                "thought": resp["thought"],
                "question": question,
                "history": self.history
            }

        # Check if they want to run git status
        if "git status" in lower:
            resp = {
                "thought": "User wants to run git status. Requesting permission.",
                "tool": "run_command",
                "args": {"cmd": "git status"},
                "message": "I need to check the git status."
            }
            self.pending_tool = {"tool": resp["tool"], "args": resp["args"]}
            self.pending_tool_id = f"req_{len(self.history)}"
            self.history.append({"role": "assistant", "content": json.dumps(resp)})
            return {
                "type": "permission_request",
                "request_id": self.pending_tool_id,
                "thought": resp["thought"],
                "tool": resp["tool"],
                "args": resp["args"],
                "message": resp["message"]
            }

        # Normal response
        msg = f"Mock Agent: I received your request '{prompt}'. Please configure an LLM in `.env` for full autonomous agent functionality."
        resp = {
            "thought": "Replying with mock guidance.",
            "tool": None,
            "args": {},
            "message": msg
        }
        self.history.append({"role": "assistant", "content": json.dumps(resp)})
        return {
            "type": "response",
            "thought": resp["thought"],
            "message": msg,
            "history": self.history
        }
