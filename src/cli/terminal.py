# -*- coding: utf-8 -*-
"""Interactive Terminal — Rich + prompt_toolkit REPL with 5 specialized modes and complete command matrix."""
from __future__ import annotations
import asyncio
import json
from dataclasses import dataclass, field
from prompt_toolkit import PromptSession
from prompt_toolkit.formatted_text import HTML
from ..core.orchestrator import Orchestrator
from ..core.agent_loop import AgentLoop
from ..core.types import NlpChatTurn, FileSnapshot
from ..utils.theme import console, render_banner, print_panel, with_spinner
from ..utils.nexus_nl_parser import parse_nexus_intent_with_llm
from ..utils.git_nl_parser import parse_git_intent_with_llm, get_git_command_help
from ..utils.security_nl_parser import parse_security_intent_with_llm, get_security_command_help
from ..utils.devops_nl_parser import parse_devops_intent_with_llm, get_devops_command_help
from ..utils.agile_nl_parser import parse_agile_intent_with_llm, get_agile_command_help
from ..utils import git_operations as gitops
from ..utils import devops_operations as devops
from ..utils import security_operations as secops
from ..utils import agile_operations as pmops
from ..utils import system_operations as sysops

@dataclass
class NlpState:
    history: list[NlpChatTurn] = field(default_factory=list)
    snapshots: list[list[FileSnapshot]] = field(default_factory=list)
    agent: AgentLoop | None = None

PROMPTS = {
    "command": HTML("<ansigreen><b>nexus &gt; </b></ansigreen>"),
    "devops": HTML("<ansiyellow><b>devops &gt; </b></ansiyellow>"),
    "git": HTML("<ansimagenta><b>git &gt; </b></ansimagenta>"),
    "security": HTML("<ansired><b>security &gt; </b></ansired>"),
    "agile": HTML("<ansiblue><b>agile &gt; </b></ansiblue>")
}

async def run_terminal(orchestrator: Orchestrator):
    render_banner()
    print_panel("Quick Start", [
        "[bold cyan]── Core System Commands ──[/]",
        "  [bold green]status[/] | [bold green]health[/] | [bold green]ai[/] | [bold green]doctor[/] | [bold green]version[/] | [bold green]help[/]",
        "",
        "[bold cyan]── Specialized Governance Modes ──[/]",
        "  [bold yellow]devops[/] | [bold magenta]git[/] | [bold red]security[/] | [bold blue]agile[/]",
        "",
        "[bold cyan]── Freeform AI Chat (Default) ──[/]",
        "  [dim]Type any question or instruction at the prompt! Nexus AI acts as ChatGPT with full codebase context.[/]",
        "",
        "[bold dim]Type 'help' in any mode for detailed commands, or 'exit' to quit.[/]"
    ])
    session: PromptSession = PromptSession()
    mode, nlp = "command", NlpState(agent=AgentLoop())

    while True:
        try:
            raw = await asyncio.get_event_loop().run_in_executor(None, lambda: session.prompt(PROMPTS.get(mode, PROMPTS["command"])))
        except (EOFError, KeyboardInterrupt):
            console.print("[bold blue]Session closed.[/]")
            break
        line = raw.strip()
        if not line:
            continue

        try:
            if mode == "command":
                result, new_mode, close = await _handle_command(orchestrator, line, session, nlp)
                if close:
                    console.print("[bold blue]Session closed.[/]")
                    break
                if new_mode:
                    mode = new_mode
                    if mode == "agile":
                        projects = await pmops.pm_project_list()
                        print_panel("Active Jira Projects", projects)
                        console.print("[bold yellow]Please select a project to proceed (enter Key/Name, or type 'exit' to cancel):[/]")
                        while True:
                            selected = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiblue><b>select project &gt; </b></ansiblue>"))
                            )
                            selected = selected.strip()
                            if not selected:
                                continue
                            if selected.lower() in ("exit", "quit", "back", "q"):
                                mode = "command"
                                console.print("[yellow]Project selection cancelled. Returning to main mode.[/]")
                                break
                            res = await pmops.pm_project_select(selected)
                            print_panel("Project Selected", res)
                            break
                if result:
                    print_panel(result.get("title", "Nexus"), result.get("output", []))

            elif mode == "git":
                if line.lower() in ("exit", "quit"): mode = "command"; console.print("[yellow]Returning to main mode.[/]"); continue
                if line.lower() == "help": print_panel("Git Help", get_git_command_help()); continue
                result = await _handle_git(orchestrator, line, session, nlp)
                print_panel(result.get("title", "Git"), result.get("output", []))

            elif mode == "security":
                if line.lower() in ("exit", "quit"): mode = "command"; console.print("[yellow]Returning to main mode.[/]"); continue
                if line.lower() == "help": print_panel("Security Help", get_security_command_help()); continue
                result = await _handle_security(orchestrator, line, session, nlp)
                print_panel(result.get("title", "Security"), result.get("output", []))

            elif mode == "devops":
                if line.lower() in ("exit", "quit"): mode = "command"; console.print("[yellow]Returning to main mode.[/]"); continue
                if line.lower() == "help": print_panel("DevOps Help", get_devops_command_help()); continue
                result = await _handle_devops(orchestrator, line, session, nlp)
                print_panel(result.get("title", "DevOps"), result.get("output", []))

            elif mode == "agile":
                if line.lower() in ("exit", "quit"): mode = "command"; console.print("[yellow]Returning to main mode.[/]"); continue
                if line.lower() == "help": print_panel("Agile Help", get_agile_command_help()); continue
                result = await _handle_agile(orchestrator, line, session, nlp)
                print_panel(result.get("title", "Agile"), result.get("output", []))

        except Exception as e:
            console.print(f"[bold red]Error: {e}[/]")

async def run_agent_loop_turn(agent: AgentLoop, raw: str, session: PromptSession) -> dict:
    res = await with_spinner("Thinking...", lambda: agent.start_turn(raw))
    
    while True:
        res_type = res.get("type")
        if res_type == "permission_request":
            if res.get("thought"):
                console.print(f"\n[bold green]Thought:[/] {res['thought']}")
            
            tool = res["tool"]
            args = res["args"]
            message = res.get("message")
            if message:
                console.print(f"[bold green]Message:[/] {message}")
                
            console.print(f"\n[bold red]🔑 Permission Required[/]")
            if tool == "run_command":
                cmd = args.get("cmd", "")
                console.print(f"Wants to run shell command:")
                console.print(f"  [bold yellow]> {cmd}[/]")
            elif tool == "edit_file":
                path = args.get("path", "")
                action = args.get("action", "update")
                content = args.get("content", "")
                console.print(f"Wants to [bold yellow]{action}[/] file: [bold cyan]{path}[/]")
                if content:
                    console.print("[dim]─── Proposed Content ───[/]")
                    console.print(content)
                    console.print("[dim]─────────────────────────[/]")
            elif tool == "create_plan":
                markdown = args.get("markdown", "")
                console.print(f"Wants to propose implementation plan:")
                console.print("[dim]─── Proposed Plan ───[/]")
                console.print(markdown)
                console.print("[dim]─────────────────────[/]")
            else:
                console.print(f"Wants to run tool: [bold cyan]{tool}[/]")
                console.print(f"Arguments: {json.dumps(args, indent=2)}")
            
            confirm = await asyncio.get_event_loop().run_in_executor(
                None, 
                lambda: session.prompt(HTML("<ansiyellow><b>Allow execution? (y/n): </b></ansiyellow>"))
            )
            allowed = confirm.strip().lower() in ("y", "yes")
            
            if allowed:
                console.print("[bold green]Executing tool...[/]")
                res = await with_spinner("Executing...", lambda: agent.resume_with_permission(True))
            else:
                console.print("[bold yellow]Permission denied.[/]")
                res = await with_spinner("Thinking...", lambda: agent.resume_with_permission(False))
                
        elif res_type == "clarification":
            if res.get("thought"):
                console.print(f"\n[bold green]Thought:[/] {res['thought']}")
            
            question = res.get("question")
            return {
                "title": "Nexus AI (Clarification)",
                "output": [question]
            }
            
        elif res_type == "response":
            if res.get("thought"):
                console.print(f"\n[bold green]Thought:[/] {res['thought']}")
                
            message = res.get("message")
            changes_made = []
            for i in range(len(agent.history)):
                turn = agent.history[i]
                if turn.get("role") == "assistant":
                    try:
                        content_data = json.loads(turn.get("content", "{}"))
                        if content_data.get("tool") == "edit_file":
                            if i + 1 < len(agent.history):
                                res_turn = agent.history[i + 1]
                                if "Tool execution result for 'edit_file'" in res_turn.get("content", ""):
                                    args = content_data.get("args", {})
                                    changes_made.append(f"  • {args.get('path')} ({args.get('action', 'update')})")
                    except Exception:
                        pass
            
            output_lines = [message]
            if changes_made:
                output_lines.append("\n[bold green]Updated files:[/]")
                output_lines.extend(changes_made)
                
            return {
                "title": "Nexus AI",
                "output": output_lines
            }
            
        elif res_type == "error":
            return {
                "title": "Nexus Error",
                "output": [f"[bold red]Error:[/] {res.get('message')}"]
            }
        else:
            return {
                "title": "Nexus AI",
                "output": [str(res)]
            }

# ── Command Mode ─────────────────────────────────────────────
async def _handle_command(o: Orchestrator, raw: str, session: PromptSession, nlp: NlpState):
    # Intercept personalization/configuration commands
    parts = raw.strip().split()
    if parts and parts[0].lower() in ("configure", "personalize", "config"):
        # Handle 'configure set <key> <value>'
        if len(parts) >= 4 and parts[1].lower() == "set":
            key = parts[2].lower()
            val = " ".join(parts[3:])
            
            # Map key names
            mapped_key = None
            if key in ("provider", "llm_provider"):
                mapped_key = "LLM_PROVIDER"
            elif key in ("gemini_api_key", "gemini_key", "gemini_api"):
                mapped_key = "GEMINI_API_KEY"
            elif key in ("gemini_model", "gemini_model_name"):
                mapped_key = "GEMINI_MODEL"
            elif key in ("anthropic_api_key", "anthropic_key", "anthropic_api"):
                mapped_key = "ANTHROPIC_API_KEY"
            elif key in ("anthropic_model", "anthropic_model_name"):
                mapped_key = "ANTHROPIC_MODEL"
            elif key in ("aws_access_key_id", "aws_access_key", "aws_key"):
                mapped_key = "AWS_ACCESS_KEY_ID"
            elif key in ("aws_secret_access_key", "aws_secret_key", "aws_secret"):
                mapped_key = "AWS_SECRET_ACCESS_KEY"
            elif key in ("aws_region", "region"):
                mapped_key = "AWS_REGION"
            elif key in ("bedrock_model_id", "bedrock_model"):
                mapped_key = "BEDROCK_MODEL_ID"
            elif key in ("nvidia_api_key", "nvidia_key", "nvidia_api"):
                mapped_key = "NVIDIA_API_KEY"
            elif key in ("nvidia_model", "nvidia_model_name"):
                mapped_key = "NVIDIA_MODEL"
            elif key in ("mistral_api_key", "mistral_key", "mistral_api"):
                mapped_key = "MISTRAL_API_KEY"
            elif key in ("mistral_model", "mistral_model_name"):
                mapped_key = "MISTRAL_MODEL"
            elif key in ("foundry_endpoint", "foundry_url", "foundry_endpoint_url"):
                mapped_key = "FOUNDRY_ENDPOINT"
            elif key in ("foundry_api_key", "foundry_key", "foundry_api"):
                mapped_key = "FOUNDRY_API_KEY"
            elif key in ("foundry_model", "foundry_model_name"):
                mapped_key = "FOUNDRY_MODEL"
            elif key in ("os_base_url", "os_url", "os_base"):
                mapped_key = "OS_BASE_URL"
            elif key in ("os_model", "os_model_name"):
                mapped_key = "OS_MODEL"
            elif key in ("os_api_key", "os_key"):
                mapped_key = "OS_API_KEY"
            elif key in ("azure_api_key", "api_key", "key"):
                mapped_key = "AZURE_OPENAI_API_KEY"
            elif key in ("azure_endpoint", "endpoint"):
                mapped_key = "AZURE_OPENAI_ENDPOINT"
            elif key in ("azure_deployment", "deployment"):
                mapped_key = "AZURE_OPENAI_DEPLOYMENT"
            elif key in ("azure_api_version", "api_version", "version"):
                mapped_key = "AZURE_OPENAI_API_VERSION"
            elif key in ("llm_api_key", "llm_key", "llm-key"):
                mapped_key = "LLM_API_KEY"
            elif key in ("llm_base_url", "llm_url", "llm-url", "llm_base"):
                mapped_key = "LLM_BASE_URL"
            elif key in ("llm_model", "llm-model", "model"):
                mapped_key = "LLM_MODEL"
            elif key in ("mock", "use_mock"):
                mapped_key = "SDLC_USE_MOCK"
                val = val.lower() if val.lower() in ("true", "false") else ("true" if val.lower() in ("y", "yes", "1") else "false")
            elif key in ("jira_host", "jira-host", "jira_url"):
                mapped_key = "JIRA_HOST"
            elif key in ("jira_email", "jira-email", "email"):
                mapped_key = "JIRA_EMAIL"
            elif key in ("jira_token", "jira_api_token", "jira-token"):
                mapped_key = "JIRA_API_TOKEN"
            elif key in ("jira_project", "jira_project_key", "project"):
                mapped_key = "JIRA_PROJECT_KEY"
            elif key in ("confluence_space", "confluence_space_key", "space"):
                mapped_key = "CONFLUENCE_SPACE_KEY"
            elif key in ("ssl", "ssl_verify", "skip_ssl"):
                mapped_key = "SDLC_SKIP_SSL_VERIFY"
                val = "true" if val.lower() in ("false", "skip", "disable", "no", "0") else "false"
                
            if not mapped_key:
                return {"title": "Configuration Error", "output": [
                    f"[bold red]✗ Unknown configuration key '{key}'.[/]",
                    "Use 'configure' for interactive menu, or see help for valid keys."
                ]}, None, False
                
            from ..utils.system_operations import update_env_var
            update_env_var(mapped_key, val)
            
            # Redact API keys/secrets/tokens/passwords in response for security
            is_sensitive = any(s in mapped_key.lower() for s in ("key", "secret", "token", "password"))
            display_val = "********" if is_sensitive else val
            return {"title": "Configuration Updated", "output": [f"[bold green]✓ Updated configuration[/]: [cyan]{mapped_key}[/] set to [yellow]{display_val}[/]"]}, None, False
            
        # Handle 'configure show' or 'configure view' or 'configure list'
        elif len(parts) >= 2 and parts[1].lower() in ("show", "view", "list"):
            from ..utils.system_operations import run_config_view
            cfg = await run_config_view()
            return {"title": "Active Configuration", "output": cfg}, None, False
            
        # Handle 'configure' (interactive mode)
        elif len(parts) == 1:
            from ..config.env import env, get_active_provider
            from ..utils.system_operations import update_env_var
            while True:
                provider = get_active_provider()
                menu_lines = [
                    f"Active LLM Provider: [bold green]{provider}[/]",
                    "",
                    "[bold cyan]── Select Provider to Configure ──[/]",
                    "  [bold white]1. Gemini[/]",
                    "  [bold white]2. Anthropic[/]",
                    "  [bold white]3. AWS Bedrock[/]",
                    "  [bold white]4. NVIDIA NIM[/]",
                    "  [bold white]5. Mistral AI[/]",
                    "  [bold white]6. Azure AI Foundry[/]",
                    "  [bold white]7. Open Source (Ollama/vLLM)[/]",
                    "  [bold white]8. Azure OpenAI[/]",
                    "  [bold white]9. Generic (OpenAI-compatible)[/]",
                    "",
                    "[bold cyan]── System Settings ──[/]",
                    f"  [bold white]10. Mock Mode[/]:  [yellow]{env.use_mock}[/]",
                    f"  [bold white]11. SSL Verify[/]: [{'green' if not env.skip_ssl_verify else 'red'}]{'Enabled' if not env.skip_ssl_verify else 'Disabled'}[/]",
                    "",
                    "[bold dim]Select option (1-11), or type 'exit' / 'back' to return.[/]"
                ]
                print_panel("Nexus AI Configuration Menu", menu_lines)
                
                choice = await asyncio.get_event_loop().run_in_executor(
                    None, 
                    lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                )
                choice = choice.strip().lower()
                if choice in ("exit", "back", "quit", "q"):
                    break
                    
                if choice == "1":  # Gemini
                    while True:
                        sub_lines = [
                            "[bold cyan]── Gemini Settings ──[/]",
                            f"  [bold white]1. API Key[/]:   [dim]{'********' if env.gemini_api_key else '(not set)'}[/]",
                            f"  [bold white]2. Model[/]:     [dim]{env.gemini_model or '(not set)'}[/]",
                            "",
                            "  [bold white]3. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-3) or type 'back' to return.[/]"
                        ]
                        print_panel("Gemini Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Gemini selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Gemini API Key: </b></ansiyellow>"))
                            )
                            update_env_var("GEMINI_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "gemini")
                            console.print("[bold green]✓ Gemini API Key updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            model_menu = [
                                "[bold cyan]── Choose Gemini Model ──[/]",
                                "  [bold white]1. gemini-2.5-flash[/]",
                                "  [bold white]2. gemini-2.5-pro[/]",
                                "  [bold white]3. gemini-1.5-flash[/]",
                                "  [bold white]4. gemini-1.5-pro[/]",
                                "  [bold white]5. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-5), or type 'back' to return.[/]"
                            ]
                            print_panel("Gemini Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "gemini-2.5-flash"
                            elif m_choice == "2": selected_model = "gemini-2.5-pro"
                            elif m_choice == "3": selected_model = "gemini-1.5-flash"
                            elif m_choice == "4": selected_model = "gemini-1.5-pro"
                            elif m_choice == "5":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Gemini Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("GEMINI_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "gemini")
                                console.print("[bold green]✓ Gemini Model updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            update_env_var("LLM_PROVIDER", "gemini")
                            console.print("[bold green]✓ Gemini set as active provider.[/]")
                            
                elif choice == "2":  # Anthropic
                    while True:
                        sub_lines = [
                            "[bold cyan]── Anthropic Settings ──[/]",
                            f"  [bold white]1. API Key[/]:   [dim]{'********' if env.anthropic_api_key else '(not set)'}[/]",
                            f"  [bold white]2. Model[/]:     [dim]{env.anthropic_model or '(not set)'}[/]",
                            "",
                            "  [bold white]3. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-3) or type 'back' to return.[/]"
                        ]
                        print_panel("Anthropic Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Anthropic selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Anthropic API Key: </b></ansiyellow>"))
                            )
                            update_env_var("ANTHROPIC_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "anthropic")
                            console.print("[bold green]✓ Anthropic API Key updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            model_menu = [
                                "[bold cyan]── Choose Anthropic Model ──[/]",
                                "  [bold white]1. claude-3-5-sonnet-latest[/]",
                                "  [bold white]2. claude-3-5-haiku-latest[/]",
                                "  [bold white]3. claude-3-opus-latest[/]",
                                "  [bold white]4. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-4), or type 'back' to return.[/]"
                            ]
                            print_panel("Anthropic Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "claude-3-5-sonnet-latest"
                            elif m_choice == "2": selected_model = "claude-3-5-haiku-latest"
                            elif m_choice == "3": selected_model = "claude-3-opus-latest"
                            elif m_choice == "4":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Anthropic Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("ANTHROPIC_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "anthropic")
                                console.print("[bold green]✓ Anthropic Model updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            update_env_var("LLM_PROVIDER", "anthropic")
                            console.print("[bold green]✓ Anthropic set as active provider.[/]")
                            
                elif choice == "3":  # Bedrock
                    while True:
                        sub_lines = [
                            "[bold cyan]── AWS Bedrock Settings ──[/]",
                            f"  [bold white]1. Access Key ID[/]:  [dim]{'********' if env.aws_access_key_id else '(not set)'}[/]",
                            f"  [bold white]2. Secret Key[/]:     [dim]{'********' if env.aws_secret_access_key else '(not set)'}[/]",
                            f"  [bold white]3. Region[/]:         [dim]{env.aws_region or '(not set)'}[/]",
                            f"  [bold white]4. Model ID[/]:       [dim]{env.bedrock_model_id or '(not set)'}[/]",
                            "",
                            "  [bold white]5. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-5) or type 'back' to return.[/]"
                        ]
                        print_panel("AWS Bedrock Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Bedrock selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter AWS Access Key ID: </b></ansiyellow>"))
                            )
                            update_env_var("AWS_ACCESS_KEY_ID", val.strip())
                            update_env_var("LLM_PROVIDER", "bedrock")
                            console.print("[bold green]✓ AWS Access Key ID updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter AWS Secret Access Key: </b></ansiyellow>"))
                            )
                            update_env_var("AWS_SECRET_ACCESS_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "bedrock")
                            console.print("[bold green]✓ AWS Secret Access Key updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter AWS Region (default us-east-1): </b></ansiyellow>"))
                            )
                            update_env_var("AWS_REGION", val.strip())
                            update_env_var("LLM_PROVIDER", "bedrock")
                            console.print("[bold green]✓ AWS Region updated and set as active provider.[/]")
                        elif sub_choice == "4":
                            model_menu = [
                                "[bold cyan]── Choose Bedrock Model ──[/]",
                                "  [bold white]1. anthropic.claude-3-5-sonnet-20241022-v2:0[/]",
                                "  [bold white]2. anthropic.claude-3-5-haiku-20241022-v1:0[/]",
                                "  [bold white]3. meta.llama3-1-70b-instruct-v1:0[/]",
                                "  [bold white]4. amazon.titan-text-express-v1[/]",
                                "  [bold white]5. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-5), or type 'back' to return.[/]"
                            ]
                            print_panel("Bedrock Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "anthropic.claude-3-5-sonnet-20241022-v2:0"
                            elif m_choice == "2": selected_model = "anthropic.claude-3-5-haiku-20241022-v1:0"
                            elif m_choice == "3": selected_model = "meta.llama3-1-70b-instruct-v1:0"
                            elif m_choice == "4": selected_model = "amazon.titan-text-express-v1"
                            elif m_choice == "5":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Bedrock Model ID: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("BEDROCK_MODEL_ID", selected_model)
                                update_env_var("LLM_PROVIDER", "bedrock")
                                console.print("[bold green]✓ Bedrock Model ID updated and set as active provider.[/]")
                        elif sub_choice == "5":
                            update_env_var("LLM_PROVIDER", "bedrock")
                            console.print("[bold green]✓ AWS Bedrock set as active provider.[/]")
                            
                elif choice == "4":  # NVIDIA
                    while True:
                        sub_lines = [
                            "[bold cyan]── NVIDIA NIM Settings ──[/]",
                            f"  [bold white]1. API Key[/]:   [dim]{'********' if env.nvidia_api_key else '(not set)'}[/]",
                            f"  [bold white]2. Model[/]:     [dim]{env.nvidia_model or '(not set)'}[/]",
                            "",
                            "  [bold white]3. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-3) or type 'back' to return.[/]"
                        ]
                        print_panel("NVIDIA NIM Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>NVIDIA selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter NVIDIA API Key: </b></ansiyellow>"))
                            )
                            update_env_var("NVIDIA_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "nvidia")
                            console.print("[bold green]✓ NVIDIA API Key updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            model_menu = [
                                "[bold cyan]── Choose NVIDIA NIM Model ──[/]",
                                "  [bold white]1. meta/llama-3.1-70b-instruct[/]",
                                "  [bold white]2. meta/llama-3.1-8b-instruct[/]",
                                "  [bold white]3. nvidia/llama-3.1-nemotron-51b-instruct[/]",
                                "  [bold white]4. mistralai/mixtral-8x22b-instruct-v0.1[/]",
                                "  [bold white]5. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-5), or type 'back' to return.[/]"
                            ]
                            print_panel("NVIDIA NIM Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "meta/llama-3.1-70b-instruct"
                            elif m_choice == "2": selected_model = "meta/llama-3.1-8b-instruct"
                            elif m_choice == "3": selected_model = "nvidia/llama-3.1-nemotron-51b-instruct"
                            elif m_choice == "4": selected_model = "mistralai/mixtral-8x22b-instruct-v0.1"
                            elif m_choice == "5":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom NVIDIA Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("NVIDIA_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "nvidia")
                                console.print("[bold green]✓ NVIDIA Model updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            update_env_var("LLM_PROVIDER", "nvidia")
                            console.print("[bold green]✓ NVIDIA set as active provider.[/]")
                            
                elif choice == "5":  # Mistral
                    while True:
                        sub_lines = [
                            "[bold cyan]── Mistral AI Settings ──[/]",
                            f"  [bold white]1. API Key[/]:   [dim]{'********' if env.mistral_api_key else '(not set)'}[/]",
                            f"  [bold white]2. Model[/]:     [dim]{env.mistral_model or '(not set)'}[/]",
                            "",
                            "  [bold white]3. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-3) or type 'back' to return.[/]"
                        ]
                        print_panel("Mistral AI Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Mistral selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Mistral API Key: </b></ansiyellow>"))
                            )
                            update_env_var("MISTRAL_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "mistral")
                            console.print("[bold green]✓ Mistral API Key updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            model_menu = [
                                "[bold cyan]── Choose Mistral Model ──[/]",
                                "  [bold white]1. mistral-large-latest[/]",
                                "  [bold white]2. open-mixtral-8x22b[/]",
                                "  [bold white]3. mistral-small-latest[/]",
                                "  [bold white]4. codestral-latest[/]",
                                "  [bold white]5. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-5), or type 'back' to return.[/]"
                            ]
                            print_panel("Mistral Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "mistral-large-latest"
                            elif m_choice == "2": selected_model = "open-mixtral-8x22b"
                            elif m_choice == "3": selected_model = "mistral-small-latest"
                            elif m_choice == "4": selected_model = "codestral-latest"
                            elif m_choice == "5":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Mistral Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("MISTRAL_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "mistral")
                                console.print("[bold green]✓ Mistral Model updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            update_env_var("LLM_PROVIDER", "mistral")
                            console.print("[bold green]✓ Mistral set as active provider.[/]")
                            
                elif choice == "6":  # Azure AI Foundry
                    while True:
                        sub_lines = [
                            "[bold cyan]── Azure AI Foundry Settings ──[/]",
                            f"  [bold white]1. Endpoint URL[/]: [dim]{env.foundry_endpoint or '(not set)'}[/]",
                            f"  [bold white]2. API Key[/]:     [dim]{'********' if env.foundry_api_key else '(not set)'}[/]",
                            f"  [bold white]3. Model[/]:       [dim]{env.foundry_model or '(not set)'}[/]",
                            "",
                            "  [bold white]4. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-4) or type 'back' to return.[/]"
                        ]
                        print_panel("Azure AI Foundry Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Foundry selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Foundry Endpoint URL: </b></ansiyellow>"))
                            )
                            update_env_var("FOUNDRY_ENDPOINT", val.strip())
                            update_env_var("LLM_PROVIDER", "azure_ai_foundry")
                            console.print("[bold green]✓ Foundry Endpoint updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Foundry API Key: </b></ansiyellow>"))
                            )
                            update_env_var("FOUNDRY_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "azure_ai_foundry")
                            console.print("[bold green]✓ Foundry API Key updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            model_menu = [
                                "[bold cyan]── Choose Foundry Model ──[/]",
                                "  [bold white]1. gpt-4o[/]",
                                "  [bold white]2. gpt-4-turbo[/]",
                                "  [bold white]3. gpt-35-turbo[/]",
                                "  [bold white]4. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-4), or type 'back' to return.[/]"
                            ]
                            print_panel("Foundry Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "gpt-4o"
                            elif m_choice == "2": selected_model = "gpt-4-turbo"
                            elif m_choice == "3": selected_model = "gpt-35-turbo"
                            elif m_choice == "4":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Foundry Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("FOUNDRY_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "azure_ai_foundry")
                                console.print("[bold green]✓ Foundry Model updated and set as active provider.[/]")
                        elif sub_choice == "4":
                            update_env_var("LLM_PROVIDER", "azure_ai_foundry")
                            console.print("[bold green]✓ Azure AI Foundry set as active provider.[/]")
                            
                elif choice == "7":  # Open Source
                    while True:
                        sub_lines = [
                            "[bold cyan]── Open Source (Ollama/vLLM) Settings ──[/]",
                            f"  [bold white]1. Base URL[/]:  [dim]{env.os_base_url or '(not set)'}[/]",
                            f"  [bold white]2. Model[/]:     [dim]{env.os_model or '(not set)'}[/]",
                            f"  [bold white]3. API Key[/]:   [dim]{'********' if env.os_api_key else '(not set)'}[/]",
                            "",
                            "  [bold white]4. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-4) or type 'back' to return.[/]"
                        ]
                        print_panel("Open Source Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Open Source selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Base URL: </b></ansiyellow>"))
                            )
                            update_env_var("OS_BASE_URL", val.strip())
                            update_env_var("LLM_PROVIDER", "open_source")
                            console.print("[bold green]✓ Base URL updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            model_menu = [
                                "[bold cyan]── Choose OS Model ──[/]",
                                "  [bold white]1. llama3[/]",
                                "  [bold white]2. llama3:8b[/]",
                                "  [bold white]3. mistral[/]",
                                "  [bold white]4. phi3[/]",
                                "  [bold white]5. qwen2.5-coder[/]",
                                "  [bold white]6. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-6), or type 'back' to return.[/]"
                            ]
                            print_panel("OS Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "llama3"
                            elif m_choice == "2": selected_model = "llama3:8b"
                            elif m_choice == "3": selected_model = "mistral"
                            elif m_choice == "4": selected_model = "phi3"
                            elif m_choice == "5": selected_model = "qwen2.5-coder"
                            elif m_choice == "6":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom OS Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("OS_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "open_source")
                                console.print("[bold green]✓ OS Model updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter OS API Key (optional): </b></ansiyellow>"))
                            )
                            update_env_var("OS_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "open_source")
                            console.print("[bold green]✓ OS API Key updated and set as active provider.[/]")
                        elif sub_choice == "4":
                            update_env_var("LLM_PROVIDER", "open_source")
                            console.print("[bold green]✓ Open Source set as active provider.[/]")
                            
                elif choice == "8":  # Azure OpenAI
                    while True:
                        sub_lines = [
                            "[bold cyan]── Azure OpenAI Settings ──[/]",
                            f"  [bold white]1. Endpoint URL[/]: [dim]{env.azure_endpoint or '(not set)'}[/]",
                            f"  [bold white]2. API Key[/]:     [dim]{'********' if env.azure_api_key else '(not set)'}[/]",
                            f"  [bold white]3. Deployment[/]:  [dim]{env.azure_deployment or '(not set)'}[/]",
                            f"  [bold white]4. API Version[/]:  [dim]{env.azure_api_version or '(not set)'}[/]",
                            "",
                            "  [bold white]5. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-5) or type 'back' to return.[/]"
                        ]
                        print_panel("Azure OpenAI Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Azure selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Azure Endpoint URL: </b></ansiyellow>"))
                            )
                            update_env_var("AZURE_OPENAI_ENDPOINT", val.strip())
                            update_env_var("LLM_PROVIDER", "azure")
                            console.print("[bold green]✓ Azure Endpoint updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Azure API Key: </b></ansiyellow>"))
                            )
                            update_env_var("AZURE_OPENAI_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "azure")
                            console.print("[bold green]✓ Azure API Key updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            model_menu = [
                                "[bold cyan]── Choose Azure Deployment Model ──[/]",
                                "  [bold white]1. gpt-4o[/]",
                                "  [bold white]2. gpt-4-turbo[/]",
                                "  [bold white]3. gpt-35-turbo[/]",
                                "  [bold white]4. Custom (type your own deployment name)[/]",
                                "",
                                "[bold dim]Select option (1-4), or type 'back' to return.[/]"
                            ]
                            print_panel("Azure OpenAI Deployment Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "gpt-4o"
                            elif m_choice == "2": selected_model = "gpt-4-turbo"
                            elif m_choice == "3": selected_model = "gpt-35-turbo"
                            elif m_choice == "4":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Deployment Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("AZURE_OPENAI_DEPLOYMENT", selected_model)
                                update_env_var("LLM_PROVIDER", "azure")
                                console.print("[bold green]✓ Azure Deployment updated and set as active provider.[/]")
                        elif sub_choice == "4":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter API Version: </b></ansiyellow>"))
                            )
                            update_env_var("AZURE_OPENAI_API_VERSION", val.strip())
                            update_env_var("LLM_PROVIDER", "azure")
                            console.print("[bold green]✓ Azure API Version updated and set as active provider.[/]")
                        elif sub_choice == "5":
                            update_env_var("LLM_PROVIDER", "azure")
                            console.print("[bold green]✓ Azure OpenAI set as active provider.[/]")
                            
                elif choice == "9":  # Generic
                    while True:
                        sub_lines = [
                            "[bold cyan]── Generic OpenAI-Compatible Settings ──[/]",
                            f"  [bold white]1. Base URL[/]:  [dim]{env.llm_base_url or '(not set)'}[/]",
                            f"  [bold white]2. API Key[/]:   [dim]{'********' if env.llm_api_key else '(not set)'}[/]",
                            f"  [bold white]3. Model[/]:     [dim]{env.llm_model or '(not set)'}[/]",
                            "",
                            "  [bold white]4. Set as Active Provider[/]",
                            "",
                            "[bold dim]Select setting (1-4) or type 'back' to return.[/]"
                        ]
                        print_panel("Generic LLM Configuration", sub_lines)
                        sub_choice = await asyncio.get_event_loop().run_in_executor(
                            None, 
                            lambda: session.prompt(HTML("<ansiyellow><b>Generic selection: </b></ansiyellow>"))
                        )
                        sub_choice = sub_choice.strip().lower()
                        if sub_choice in ("back", "b", "exit", "quit"):
                            break
                        if sub_choice == "1":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter Base URL: </b></ansiyellow>"))
                            )
                            update_env_var("LLM_BASE_URL", val.strip())
                            update_env_var("LLM_PROVIDER", "generic")
                            console.print("[bold green]✓ LLM Base URL updated and set as active provider.[/]")
                        elif sub_choice == "2":
                            val = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter API Key: </b></ansiyellow>"))
                            )
                            update_env_var("LLM_API_KEY", val.strip())
                            update_env_var("LLM_PROVIDER", "generic")
                            console.print("[bold green]✓ LLM API Key updated and set as active provider.[/]")
                        elif sub_choice == "3":
                            model_menu = [
                                "[bold cyan]── Choose Generic Model ──[/]",
                                "  [bold white]1. gpt-4o[/]",
                                "  [bold white]2. gpt-4-turbo[/]",
                                "  [bold white]3. gpt-3.5-turbo[/]",
                                "  [bold white]4. Custom (type your own model name)[/]",
                                "",
                                "[bold dim]Select option (1-4), or type 'back' to return.[/]"
                            ]
                            print_panel("Generic Model Selection", model_menu)
                            m_choice = await asyncio.get_event_loop().run_in_executor(
                                None, 
                                lambda: session.prompt(HTML("<ansiyellow><b>Enter selection: </b></ansiyellow>"))
                            )
                            m_choice = m_choice.strip().lower()
                            selected_model = None
                            if m_choice == "1": selected_model = "gpt-4o"
                            elif m_choice == "2": selected_model = "gpt-4-turbo"
                            elif m_choice == "3": selected_model = "gpt-3.5-turbo"
                            elif m_choice == "4":
                                val = await asyncio.get_event_loop().run_in_executor(
                                    None, 
                                    lambda: session.prompt(HTML("<ansiyellow><b>Enter custom Model Name: </b></ansiyellow>"))
                                )
                                if val.strip(): selected_model = val.strip()
                            if selected_model:
                                update_env_var("LLM_MODEL", selected_model)
                                update_env_var("LLM_PROVIDER", "generic")
                                console.print("[bold green]✓ LLM Model updated and set as active provider.[/]")
                        elif sub_choice == "4":
                            update_env_var("LLM_PROVIDER", "generic")
                            console.print("[bold green]✓ Generic OpenAI-compatible set as active provider.[/]")
                            
                elif choice == "10":  # Mock Mode
                    val = await asyncio.get_event_loop().run_in_executor(
                        None, 
                        lambda: session.prompt(HTML("<ansiyellow><b>Enable Mock Mode? (y/n): </b></ansiyellow>"))
                    )
                    is_mock = "true" if val.strip().lower() in ("y", "yes", "true", "1") else "false"
                    update_env_var("SDLC_USE_MOCK", is_mock)
                    console.print(f"[bold green]✓ Mock Mode set to {is_mock}.[/]")
                    
                elif choice == "11":  # SSL Verify
                    val = await asyncio.get_event_loop().run_in_executor(
                        None, 
                        lambda: session.prompt(HTML("<ansiyellow><b>Enable SSL Verification? (y/n): </b></ansiyellow>"))
                    )
                    skip_ssl = "false" if val.strip().lower() in ("y", "yes", "true", "1") else "true"
                    update_env_var("SDLC_SKIP_SSL_VERIFY", skip_ssl)
                    console.print(f"[bold green]✓ SSL Verification set to {'Enabled' if skip_ssl == 'false' else 'Disabled'}.[/]")
                    
                else:
                    console.print("[bold red]✗ Invalid selection. Please enter 1-11 or 'exit'.[/]")
            
            return None, None, False
        else:
            return {"title": "Configuration Help", "output": [
                "Usage for configure command:",
                "  [bold green]configure[/]                      Enter interactive personalization menu",
                "  [bold green]configure show[/]                 Display current active configurations",
                "  [bold green]configure set <key> <value>[/]    Directly set a configuration key",
                "",
                "Valid keys:",
                "  [cyan]provider[/], [cyan]mock[/], [cyan]ssl[/]",
                "  [cyan]gemini_api_key[/], [cyan]gemini_model[/]",
                "  [cyan]anthropic_api_key[/], [cyan]anthropic_model[/]",
                "  [cyan]aws_access_key_id[/], [cyan]aws_secret_access_key[/], [cyan]aws_region[/], [cyan]bedrock_model_id[/]",
                "  [cyan]nvidia_api_key[/], [cyan]nvidia_model[/]",
                "  [cyan]mistral_api_key[/], [cyan]mistral_model[/]",
                "  [cyan]foundry_endpoint[/], [cyan]foundry_api_key[/], [cyan]foundry_model[/]",
                "  [cyan]os_base_url[/], [cyan]os_model[/], [cyan]os_api_key[/]",
                "  [cyan]azure_endpoint[/], [cyan]azure_api_key[/], [cyan]azure_deployment[/], [cyan]azure_api_version[/]",
                "  [cyan]llm_base_url[/], [cyan]llm_api_key[/], [cyan]llm_model[/]"
            ]}, None, False

    intent = await parse_nexus_intent_with_llm(raw)
    c, a = intent.command, intent.args

    # System Handlers
    if c == "status":
        r = await with_spinner("Loading...", lambda: sysops.run_system_status(include_jira_confluence=False))
        return {"title": "Nexus Status", "output": r}, None, False
    elif c == "health":
        r = await with_spinner("Checking Health...", sysops.run_system_health)
        return {"title": "System Health", "output": r}, None, False
    elif c == "doctor":
        r = await with_spinner("Running Diagnostics...", sysops.run_system_doctor)
        return {"title": "System Doctor", "output": r}, None, False
    elif c == "version":
        r = await with_spinner("Fetching Version...", sysops.run_system_version)
        return {"title": "System Version", "output": r}, None, False
    elif c == "ai":
        h = await with_spinner("Checking AI Health...", o.ai_health)
        rcolor = "bold green" if h.reachable else "bold red"
        return {"title": "AI Service Health", "output": [
            f"• [bold white]Mode[/]: [bold cyan]{h.mode}[/]",
            f"• [bold white]Configured[/]: [{'bold green' if h.configured else 'bold red'}]{h.configured}[/]",
            f"• [bold white]Reachable[/]: [{rcolor}]{h.reachable}[/]",
            f"• [bold white]Message[/]: [{rcolor}]{h.message}[/]"
        ]}, None, False

    # Direct mode forwarding
    if c == "agile-direct":
        res = await _handle_agile(o, a[0], session)
        return res, None, False
    if c == "devops-direct":
        res = await _handle_devops(o, a[0])
        return res, None, False
    if c == "git-direct":
        res = await _handle_git(o, a[0])
        return res, None, False
    if c == "security-direct":
        res = await _handle_security(o, a[0])
        return res, None, False
 
    elif c in ("security", "devops", "git", "agile"):
        return {"title": f"{c.title()} Mode", "output": [f"Entering {c} mode. Type 'help' for commands, 'exit' to return."]}, c, False
    elif c == "help":
        return {"title": "Nexus Assistant Help", "output": [
            "[bold cyan]── Core System ──[/]",
            "  [bold green]status[/]             Show workspace runtime status",
            "  [bold green]health[/]             Check integrations & services health",
            "  [bold green]ai[/]                 Check AI service health & reachability",
            "  [bold green]doctor[/]             Run comprehensive system diagnostics",
            "  [bold green]version[/]            Display installed module version",
            "  [bold green]help[/]               Display this help menu",
            "",
            "[bold cyan]── Freeform AI Chat (Default) ──[/]",
            "  [dim]Main mode is chat-free! Ask any question, instruction, or codebase task directly at the prompt.[/]",
            "",
            "[bold cyan]── Specialized Governance Modes ──[/]",
            "  [bold green]security[/]           Interactive Security & SAST governance mode",
            "  [bold green]devops[/]             Interactive CI/CD, Docker, Terraform & infra mode",
            "  [bold green]git[/]                Interactive Git command & policy mode",
            "  [bold green]agile[/]              Agile mode (Jira/Sprints/Agile)",
            "",
            "  [bold dim]exit[/]               Close session"
        ]}, None, False
    elif c == "exit": return None, None, True
    else:
        # Default mode is NLP freeform AI chat / command
        if raw.lower().strip() == "show diff":
            return {"title": "Diff", "output": ["No AI changes to diff."] if not nlp.snapshots else [f"Changed: {s.path}" for batch in nlp.snapshots for s in batch]}, None, False
        if raw.lower().strip() == "undo last change":
            if not nlp.snapshots: return {"title": "Undo", "output": ["Nothing to undo."]}, None, False
            await o.undo_nlp_changes(nlp.snapshots.pop()); return {"title": "Undo", "output": ["Reverted last AI change."]}, None, False
        
        if not nlp.agent:
            nlp.agent = AgentLoop()
            
        res = await run_agent_loop_turn(nlp.agent, raw, session)
        return res, None, False

async def execute_command_string(o: Orchestrator, cmd_str: str, session: PromptSession, nlp: NlpState) -> dict | None:
    intent = await parse_nexus_intent_with_llm(cmd_str)
    c, a = intent.command, intent.args
    
    if c == "agile-direct":
        return await _handle_agile(o, a[0], session, nlp)
    elif c == "devops-direct":
        return await _handle_devops(o, a[0], session, nlp)
    elif c == "git-direct":
        return await _handle_git(o, a[0], session, nlp)
    elif c == "security-direct":
        return await _handle_security(o, a[0], session, nlp)
    elif c in ("status", "health", "doctor", "version", "ai"):
        res, _, _ = await _handle_command(o, cmd_str, session, nlp)
        return res
    else:
        agile_intent = await parse_agile_intent_with_llm(cmd_str)
        if agile_intent.command != "unknown":
            return await _handle_agile(o, cmd_str, session, nlp)
        sec_intent = await parse_security_intent_with_llm(cmd_str)
        if sec_intent.command != "unknown":
            return await _handle_security(o, cmd_str, session, nlp)
        dev_intent = await parse_devops_intent_with_llm(cmd_str)
        if dev_intent.command != "unknown":
            return await _handle_devops(o, cmd_str, session, nlp)
        git_intent = await parse_git_intent_with_llm(cmd_str)
        if git_intent.command != "unknown":
            return await _handle_git(o, cmd_str, session, nlp)
    return None

# ── Git Mode ─────────────────────────────────────────────────
async def _handle_git(o: Orchestrator, raw: str, session: PromptSession, nlp: NlpState) -> dict:
    intent = await parse_git_intent_with_llm(raw)
    c, a = intent.command, intent.args
    if c == "unknown":
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    handlers = {
        # ── Status & Info ──
        "status": gitops.git_status,
        "log": lambda: gitops.git_log(int(a[0]) if a else 10),
        "diff": lambda: gitops.git_diff(a[0] if a else None),
        "diff-staged": gitops.git_diff_staged,
        "show": lambda: gitops.git_show_commit(a[0]) if a else [" Usage: show <sha>"],
        "blame": lambda: gitops.git_blame(a[0]) if a else ["Usage: blame <file>"],
        "shortlog": gitops.git_shortlog,
        # ── Staging ──
        "add": lambda: gitops.git_add(a[0]) if a else gitops.git_add_all(),
        "add-all": gitops.git_add_all,
        "unstage": lambda: gitops.git_unstage(a[0]) if a else "Usage: unstage <file>",
        # ── Committing ──
        "commit": lambda: gitops.git_commit(a[0]) if a else "Usage: commit <message>",
        "commit-all": lambda: gitops.git_commit_all(a[0]) if a else "Usage: commit all <message>",
        "revert": lambda: gitops.git_revert(a[0]) if a else "Usage: revert <sha>",
        # ── Reset ──
        "reset-soft": lambda: gitops.git_reset_soft(a[0] if a else "HEAD~1"),
        "reset-mixed": lambda: gitops.git_reset_mixed(a[0] if a else "HEAD~1"),
        "reset-hard": lambda: gitops.git_reset_hard(a[0] if a else "HEAD~1"),
        "clean": gitops.git_clean,
        "clean-dry-run": gitops.git_clean_dry_run,
        # ── Branching ──
        "branch-list": gitops.git_list_branches,
        "branch-create": lambda: gitops.git_create_branch(a[0]) if a else "Usage: branch <name>",
        "checkout": lambda: gitops.git_checkout(a[0]) if a else "Usage: switch <name>",
        "branch-delete": lambda: gitops.git_delete_branch(a[0]) if a else "Usage: delete branch <name>",
        "merge": lambda: gitops.git_merge(a[0]) if a else "Usage: merge <branch>",
        # ── Rebase ──
        "rebase": lambda: gitops.git_rebase(a[0]) if a else "Usage: rebase <branch>",
        "rebase-interactive": lambda: gitops.git_rebase_interactive(int(a[0]) if a else 3),
        "rebase-continue": gitops.git_rebase_continue,
        "rebase-abort": gitops.git_rebase_abort,
        "rebase-skip": gitops.git_rebase_skip,
        # ── Remote & Sync ──
        "pull": gitops.git_pull,
        "push": lambda: gitops.git_push(a[0] if a else None),
        "fetch": gitops.git_fetch,
        "remote": gitops.git_list_remotes,
        "remote-add": lambda: gitops.git_remote_add(a[0], a[1]) if len(a) >= 2 else "Usage: add remote <name> <url>",
        "remote-remove": lambda: gitops.git_remote_remove(a[0]) if a else "Usage: remove remote <name>",
        "remote-rename": lambda: gitops.git_remote_rename(a[0], a[1]) if len(a) >= 2 else "Usage: rename remote <old> <new>",
        "clone": lambda: gitops.github_clone(a[0] if a else "https://github.com/org/repo"),
        "init": gitops.git_init,
        # ── Stash ──
        "stash": gitops.git_stash,
        "stash-pop": gitops.git_stash_pop,
        "stash-list": gitops.git_stash_list,
        "stash-save": lambda: gitops.git_stash_save(a[0]) if a else "Usage: save stash as <name>",
        "stash-drop": lambda: gitops.git_stash_drop(int(a[0]) if a else 0),
        "stash-apply": lambda: gitops.git_stash_apply(int(a[0]) if a else 0),
        # ── Tags ──
        "tag": lambda: gitops.git_tag(a[0]) if a else "Usage: tag <name>",
        "tag-commit": lambda: gitops.git_tag_commit(a[0], a[1]) if len(a) >= 2 else "Usage: tag <name> <sha>",
        "tag-list": gitops.git_list_tags,
        "tag-delete": lambda: gitops.git_tag_delete(a[0]) if a else "Usage: delete tag <name>",
        "push-tags": gitops.git_push_tags,
        # ── Reflog & Cherry-pick ──
        "reflog": lambda: gitops.git_reflog(int(a[0]) if a else 20),
        "cherry-pick": lambda: gitops.git_cherry_pick(a[0]) if a else "Usage: cherry-pick <sha>",
        # ── Worktree ──
        "worktree-list": gitops.git_worktree_list,
        "worktree-add": lambda: gitops.git_worktree_add(a[0], a[1] if len(a) > 1 else "") if a else "Usage: add worktree <path>",
        "worktree-remove": lambda: gitops.git_worktree_remove(a[0]) if a else "Usage: remove worktree <path>",
        # ── Submodule ──
        "submodule-status": gitops.git_submodule_status,
        "submodule-update": gitops.git_submodule_update,
        "submodule-add": lambda: gitops.git_submodule_add(a[0], a[1] if len(a) > 1 else "") if a else "Usage: add submodule <url>",
        # ── Bisect ──
        "bisect-start": gitops.git_bisect_start,
        "bisect-good": lambda: gitops.git_bisect_good(a[0] if a else ""),
        "bisect-bad": lambda: gitops.git_bisect_bad(a[0] if a else ""),
        "bisect-reset": gitops.git_bisect_reset,
        # ── Config ──
        "config": gitops.git_config_list,
        "config-set": lambda: gitops.git_config_set(a[0], a[1]) if len(a) >= 2 else "Usage: set config <key> <value>",
        # ── GitHub ──
        "github-auth": gitops.github_auth,
        "github-clone": lambda: gitops.github_clone(a[0] if a else "https://github.com/org/repo"),
        "github-commit": lambda: gitops.github_commit(a[0] if a else "Update files"),
        "github-push": lambda: gitops.github_push(a[0] if a else ""),
        "github-pull": gitops.github_pull,
        "github-branches": gitops.github_branches,
        "github-issues": gitops.github_issues,
        "github-releases": gitops.github_releases,
        "github-pr-create": lambda: gitops.github_pr_create(a[0] if a else "Feature Update"),
        "github-pr-merge": lambda: gitops.github_pr_merge(a[0] if a else "42"),
    }
    fn = handlers.get(c)
    if not fn:
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    r = await with_spinner("Running...", fn) if callable(fn) else fn
    return {"title": f"Git: {c}", "output": r if isinstance(r, list) else [str(r)]}

# ── Security Mode ────────────────────────────────────────────
async def _handle_security(o: Orchestrator, raw: str, session: PromptSession, nlp: NlpState) -> dict:
    intent = await parse_security_intent_with_llm(raw)
    c, a = intent.command, intent.args
    if c == "unknown":
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    handlers = {
        "status": secops.check_file_status,
        "scan": secops.run_full_scan, "scan-errors": secops.run_scan_errors_only, "scan-warnings": secops.run_scan_warnings_only,
        "scan-summary": secops.run_scan_summary, "scan-file": lambda: secops.run_scan_file(a[0]) if a else ["Usage: scan file <path>"],
        "rules": secops.get_scan_rules, "secrets": secops.check_for_secrets, "env-audit": secops.audit_env_file,
        "sensitive-fields": secops.get_sensitive_fields, "deps-audit": secops.audit_dependencies,
        "licenses": secops.check_licenses, "vault": secops.check_vault_status, "config-security": secops.check_config_security,
        "compliance": secops.run_compliance_check, "gitflow": secops.get_gitflow_policy, "codeowners": secops.check_codeowners,
        "docker-security": secops.check_docker_security, "terraform-security": secops.check_terraform_security,
        "dashboard": secops.get_security_dashboard, "posture": secops.get_security_posture,
        "sast": secops.run_security_sast, "dast": secops.run_security_dast, "dependencies": secops.run_security_dependencies,
        "report": secops.run_security_report, "scan-history": secops.get_scan_history
    }
    fn = handlers.get(c)
    if not fn:
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    r = await with_spinner("Analyzing...", fn)
    return {"title": f"Security: {c}", "output": r if isinstance(r, list) else [str(r)]}

# ── DevOps Mode ──────────────────────────────────────────────
async def _handle_devops(o: Orchestrator, raw: str, session: PromptSession, nlp: NlpState) -> dict:
    intent = await parse_devops_intent_with_llm(raw)
    c, a = intent.command, intent.args
    if c == "unknown":
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    from ..utils.git import create_release_branch, create_hotfix_branch, merge_feature_to_develop, rollback_last_commit, rollback_to_commit
    handlers = {
        "cicd": devops.get_cicd_overview, "jenkins-validate": devops.validate_jenkins, "jenkins-stages": devops.get_jenkins_stages,
        "jenkins-params": devops.get_jenkins_params, "actions": devops.get_github_actions_info, "actions-validate": devops.validate_github_actions,
        "pipeline-health": devops.get_pipeline_health, "scan": devops.run_full_security_scan, "scan-errors": devops.run_security_scan_errors_only,
        "secrets-check": devops.check_for_secrets, "docker-info": devops.get_dockerfile_info, "docker-stages": devops.get_docker_stages,
        "docker-validate": devops.validate_dockerfile, "terraform-info": devops.get_terraform_info, "infra-resources": devops.list_infra_resources,
        "env-show": devops.show_environment_config, "env-compare": devops.compare_environments, "env-validate": devops.validate_environment_files,
        "deps-audit": devops.audit_dependencies, "deps-check": devops.check_outdated_deps, "deps-licenses": devops.check_licenses,
        "deploy-status": devops.get_deployment_status, "deploy-check": lambda: devops.pre_deploy_check(a[0]) if a else ["Usage: deploy check <env>"],
        "release": lambda: create_release_branch(a[0]) if a else "Usage: release <version>",
        "hotfix": lambda: create_hotfix_branch(a[0]) if a else "Usage: hotfix <ticketId>",
        "merge": lambda: merge_feature_to_develop(a[0]) if a else "Usage: merge <ticketId>",
        "rollback": lambda: rollback_to_commit(a[0]) if a else rollback_last_commit(),
        "push": lambda: o.push(a[0]) if a else "Usage: push <ticketId>",
        "summary": devops.get_full_devops_summary, "changed": lambda: o.changed_files(),
        "health": devops.get_system_health, "pr-check": devops.run_pr_readiness_check,
        "jenkins-auth": devops.jenkins_auth, "jenkins-jobs": devops.jenkins_jobs, "jenkins-status": devops.jenkins_status,
        "jenkins-trigger": lambda: devops.jenkins_trigger(a[0] if a else "nexus-core-build"),
        "jenkins-logs": lambda: devops.jenkins_logs(a[0] if a else "nexus-core-build"),
        "jenkins-stop": lambda: devops.jenkins_stop(a[0] if a else "nexus-core-build"),
        "docker-build": lambda: devops.docker_build(a[0] if a else "latest"),
        "docker-run": lambda: devops.docker_run(a[0] if a else "nexus-app:latest"),
        "docker-stop": lambda: devops.docker_stop(a[0] if a else "d9b32a18f4"),
        "docker-images": devops.docker_images, "docker-ps": devops.docker_ps,
        "docker-logs": lambda: devops.docker_logs(a[0] if a else "d9b32a18f4"),
        "docker-remove": lambda: devops.docker_remove(a[0] if a else "d9b32a18f4"),
        "k8s-deploy": lambda: devops.k8s_deploy(a[0] if a else "k8s/deployment.yaml"),
        "k8s-pods": devops.k8s_pods, "k8s-services": devops.k8s_services,
        "k8s-logs": lambda: devops.k8s_logs(a[0] if a else "nexus-backend-7c859d"),
        "k8s-scale": lambda: devops.k8s_scale(a[0] if a else "nexus-backend", a[1] if len(a)>1 else "3"),
        "k8s-restart": lambda: devops.k8s_restart(a[0] if a else "nexus-backend"),
        "k8s-delete": lambda: devops.k8s_delete(a[0] if a else "pod/old-worker"),
        "monitor-status": devops.monitor_status, "monitor-logs": devops.monitor_logs, "monitor-metrics": devops.monitor_metrics,
        "monitor-alerts": devops.monitor_alerts, "monitor-health": devops.monitor_health,
        "deploy-start": lambda: devops.deploy_start(a[0] if a else "production"),
        "deploy-rollback": lambda: devops.deploy_rollback(a[0] if a else "v0.0.9"),
        "deploy-history": devops.deploy_history,
        "release-create": lambda: devops.release_create(a[0] if a else "v0.1.0"),
        "release-deploy": lambda: devops.release_deploy(a[0] if a else "v0.1.0", a[1] if len(a)>1 else "production"),
        "release-notes": lambda: devops.release_notes(a[0] if a else "v0.1.0"),
        "release-rollback": lambda: devops.release_rollback(a[0] if a else "v0.0.9"),
        "release-history": devops.release_history
    }
    fn = handlers.get(c)
    if not fn:
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    r = await with_spinner("Processing...", fn)
    return {"title": f"DevOps: {c}", "output": r if isinstance(r, list) else [str(r)]}

# ── Agile Mode ───────────────────────────────────────────────
async def _handle_agile(o: Orchestrator, raw: str, session: PromptSession, nlp: NlpState) -> dict:
    intent = await parse_agile_intent_with_llm(raw)
    c, a = intent.command, intent.args
    if c == "unknown":
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res

    if c == "jira-auth" or c == "jira-login":
        auth_ok = await with_spinner("Checking Jira Auth...", o.pm_jira_auth)
        return {"title": "Jira Auth", "output": ["[bold green]✓ Authenticated[/]" if auth_ok else "[bold red]✗ Authentication Failed[/]"]}
    elif c == "story-create":
        summary = a[0] if a else None
        if not summary:
            return {"title": "Create Story", "output": ["Usage: story create <summary>"]}
        desc = await asyncio.get_event_loop().run_in_executor(None, lambda: session.prompt("Enter description (optional): "))
        key = await with_spinner("Creating Story...", lambda: o.pm_story_create(summary, desc))
        return {"title": "Create Story", "output": [f"[bold green]✓ Created story:[/] {key}" if key else "[bold red]✗ Failed to create story.[/]"]}
    elif c == "jira-transition":
        if len(a) < 2: return {"title": "Jira Transition", "output": ["Usage: jira transition <ticket_id> <status_name>"]}
        ticket_id, target_status = a[0], " ".join(a[1:])
        transitions = await with_spinner("Fetching transitions...", lambda: o.pm_fetch_transitions(ticket_id))
        
        target = next((t for t in transitions if t.get("name", "").lower() == target_status.lower() or t.get("to", {}).get("name", "").lower() == target_status.lower()), None)
        if not target:
            valid = ", ".join([t.get("name") for t in transitions]) if transitions else "none"
            return {"title": "Jira Transition", "output": [f"[bold red]✗ Invalid target status '{target_status}'.[/]", f"Valid options: {valid}"]}
            
        confirm = await asyncio.get_event_loop().run_in_executor(None, lambda: session.prompt(f"Are you sure you want to transition {ticket_id} to '{target['name']}'? (y/n) "))
        if confirm.strip().lower() not in ("y", "yes"):
            return {"title": "Jira Transition", "output": ["[bold yellow]Transition cancelled.[/]"]}
            
        success = await with_spinner(f"Transitioning {ticket_id}...", lambda: o.pm_execute_transition(ticket_id, target["id"]))
        return {"title": "Jira Transition", "output": [f"[bold green]✓ Successfully transitioned {ticket_id} to {target['name']}[/]" if success else f"[bold red]✗ Failed to transition {ticket_id}[/]"]}
    elif c == "story-list":
        r = await with_spinner("Fetching stories...", pmops.pm_story_list)
        return {"title": "Jira Stories", "output": r}
    elif c == "tickets":
        tickets = await with_spinner("Fetching tickets...", o.list_tickets)
        color_map = {"High": "bold red", "Medium": "bold yellow", "Low": "bold green", "Urgent": "bold magenta"}
        return {"title": "Jira Tickets", "output": [
            f"[bold cyan]{t.id}[/] — [bold white]{t.title}[/] [[{color_map.get(t.priority, 'bold yellow')}]{t.priority}[/]]" for t in tickets
        ] or ["[bold yellow]⚠ No tickets found.[/]"]}
    elif c == "plan":
        tid = a[0] if a else raw.split()[-1]; mode = a[1] if len(a) > 1 else "basic"
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            res, _, _ = await _handle_command(o, raw, session, nlp)
            return res
        plan = await with_spinner(f"Planning {tid}...", lambda: o.plan(tid, mode))
        return {"title": f"Plan: [bold cyan]{tid}[/]", "output": [
            f"[bold green]{i+1}.[/] [white]{s}[/]" for i, s in enumerate(plan.steps)
        ]}
    elif c == "execute":
        tid = a[0] if a else raw.split()[-1]
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            res, _, _ = await _handle_command(o, raw, session, nlp)
            return res
        r = await with_spinner(f"Executing {tid}...", lambda: o.execute(tid))
        return {"title": f"Execute: [bold cyan]{tid}[/]", "output": [
            f"[bold green]✓ Updated files[/]: [cyan]{', '.join(r.updated_files) or 'none'}[/]",
            f"[bold green]✓ Generated tests[/]: [cyan]{', '.join(r.generated_tests) or 'none'}[/]",
            f"[bold magenta]• Ticket status[/]: [bold yellow]{r.ticket_status}[/]"
        ]}
    elif c == "status-ticket":
        s = await with_spinner("Loading...", lambda: o.status("command"))
        lines = [f"[bold dodger_blue2]AI Service[/]: [bold cyan]{s.ai_mode}[/] ([green if s.ai_configured else 'red']{'configured' if s.ai_configured else 'not configured'}[/])", ""]
        for t in s.tickets:
            scolor = "bold green" if t.status == "COMPLETED" else "bold yellow" if t.status == "IN_DEVELOPMENT" else "cyan"
            lines.append(f"  • [bold white]{t.ticket_id}[/]: [{scolor}]{t.status}[/] ([dim italic]{t.note or 'No notes'}[/])")
        return {"title": "Workspace Status", "output": lines}
    elif c == "push":
        tid = a[0] if a else raw.split()[-1]
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            res, _, _ = await _handle_command(o, raw, session, nlp)
            return res
        r = await with_spinner(f"Pushing {tid}...", lambda: o.push(tid))
        return {"title": f"Push: [bold cyan]{tid}[/]", "output": [f"[bold green]✓[/] {r}"]}
    elif c == "reset":
        tid = a[0] if a else raw.split()[-1]
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            res, _, _ = await _handle_command(o, raw, session, nlp)
            return res
        await o.reset_ticket_status(tid)
        return {"title": f"Reset: [bold cyan]{tid}[/]", "output": [f"[bold green]✓[/] Reset workflow status for [bold cyan]{tid}[/]."]}
    elif c == "reset-all":
        await o.reset_all_ticket_statuses()
        return {"title": "Reset All Tickets", "output": ["[bold green]✓[/] Successfully reset all ticket statuses to TODO."]}

    handlers = {
        "project-create": lambda: pmops.pm_project_create(a[0] if a else "Demo Project", a[1] if len(a)>1 else "DEMO"),
        "project-list": pmops.pm_project_list,
        "project-info": lambda: pmops.pm_project_info(a[0] if a else ""),
        "project-status": lambda: pmops.pm_project_status(a[0] if a else ""),
        "project-delete": lambda: pmops.pm_project_delete(a[0] if a else "DEMO"),
        "project-archive": lambda: pmops.pm_project_archive(a[0] if a else "DEMO"),
        "project-select": lambda: pmops.pm_project_select(a[0] if a else "SDLC"),
        "epic-create": lambda: pmops.pm_epic_create(a[0] if a else "New Epic Feature"),
        "epic-list": pmops.pm_epic_list,
        "epic-view": lambda: pmops.pm_epic_view(a[0] if a else "SDLC-101"),
        "epic-update": lambda: pmops.pm_epic_update(a[0] if a else "SDLC-101", a[1] if len(a)>1 else "summary", a[2] if len(a)>2 else "Updated Summary"),
        "epic-delete": lambda: pmops.pm_epic_delete(a[0] if a else "SDLC-101"),
        "epic-stories": lambda: pmops.pm_epic_stories(a[0] if a else "SDLC-101"),
        "epic-progress": lambda: pmops.pm_epic_progress(a[0] if a else "SDLC-101"),
        "epic-assign": lambda: pmops.pm_epic_assign(a[0] if a else "SDLC-101", a[1] if len(a)>1 else "admin"),
        "story-view": lambda: pmops.pm_story_view(a[0] if a else "SDLC-10"),
        "story-update": lambda: pmops.pm_story_update(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "priority", a[2] if len(a)>2 else "High"),
        "story-move": lambda: pmops.pm_story_move(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "In Progress"),
        "story-assign": lambda: pmops.pm_story_assign(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "admin"),
        "story-close": lambda: pmops.pm_story_close(a[0] if a else "SDLC-10"),
        "story-reopen": lambda: pmops.pm_story_reopen(a[0] if a else "SDLC-10"),
        "story-delete": lambda: pmops.pm_story_delete(a[0] if a else "SDLC-10"),
        "story-points": lambda: pmops.pm_story_points(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "8"),
        "story-comment": lambda: pmops.pm_story_comment(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "Reviewed."),
        "story-search": lambda: pmops.pm_story_search(a[0] if a else "security"),
        "task-create": lambda: pmops.pm_task_create(a[0] if a else "Refactor module"),
        "task-update": lambda: pmops.pm_task_update(a[0] if a else "SDLC-301", a[1] if len(a)>1 else "Updated Task"),
        "task-assign": lambda: pmops.pm_task_assign(a[0] if a else "SDLC-301", a[1] if len(a)>1 else "admin"),
        "task-move": lambda: pmops.pm_task_move(a[0] if a else "SDLC-301", a[1] if len(a)>1 else "In Progress"),
        "task-complete": lambda: pmops.pm_task_complete(a[0] if a else "SDLC-301"),
        "task-delete": lambda: pmops.pm_task_delete(a[0] if a else "SDLC-301"),
        "task-list": pmops.pm_task_list,
        "subtask-create": lambda: pmops.pm_subtask_create(a[0] if a else "SDLC-301", a[1] if len(a)>1 else "Subtask detail"),
        "subtask-update": lambda: pmops.pm_subtask_update(a[0] if a else "SUB-1", a[1] if len(a)>1 else "Update"),
        "subtask-assign": lambda: pmops.pm_subtask_assign(a[0] if a else "SUB-1", a[1] if len(a)>1 else "admin"),
        "subtask-complete": lambda: pmops.pm_subtask_complete(a[0] if a else "SUB-1"),
        "subtask-delete": lambda: pmops.pm_subtask_delete(a[0] if a else "SUB-1"),
        "subtask-list": pmops.pm_subtask_list,
        "sprint-create": lambda: pmops.pm_sprint_create(a[0] if a else "Sprint 3"),
        "sprint-start": lambda: pmops.pm_sprint_start(a[0] if a else "Sprint 2"),
        "sprint-stop": lambda: pmops.pm_sprint_stop(a[0] if a else "Sprint 2"),
        "sprint-close": lambda: pmops.pm_sprint_close(a[0] if a else "Sprint 2"),
        "sprint-delete": lambda: pmops.pm_sprint_delete(a[0] if a else "Sprint 1"),
        "sprint-list": pmops.pm_sprint_list,
        "sprint-active": pmops.pm_sprint_active,
        "sprint-backlog": pmops.pm_sprint_backlog,
        "sprint-report": pmops.pm_sprint_report,
        "sprint-burndown": pmops.pm_sprint_burndown,
        "sprint-velocity": pmops.pm_sprint_velocity,
        "board-view": pmops.pm_board_view,
        "board-backlog": pmops.pm_board_backlog,
        "board-active": pmops.pm_board_active,
        "board-roadmap": pmops.pm_board_roadmap,
        "board-refresh": pmops.pm_board_refresh,
        "jira-logout": pmops.pm_jira_logout,
        "jira-sync": pmops.pm_jira_sync,
        "jira-search": lambda: pmops.pm_jira_search(a[0] if a else "bug"),
        "jira-comment": lambda: pmops.pm_jira_comment(a[0] if a else "SDLC-10", a[1] if len(a)>1 else "LGTM"),
        "jira-export": pmops.pm_jira_export,
        "jira-import": lambda: pmops.pm_jira_import(a[0] if a else "issues.json"),
        "jira-webhook": pmops.pm_jira_webhook,
        "docs-create": lambda: pmops.pm_docs_create(a[0] if a else "Architecture Plan"),
        "docs-update": lambda: pmops.pm_docs_update(a[0] if a else "Architecture Plan"),
        "docs-publish": lambda: pmops.pm_docs_publish(a[0] if a else "Architecture Plan"),
        "docs-search": lambda: pmops.pm_docs_search(a[0] if a else "requirements"),
        "docs-delete": lambda: pmops.pm_docs_delete(a[0] if a else "Old Doc"),
        "docs-link": lambda: pmops.pm_docs_link(a[0] if a else "Spec Doc", a[1] if len(a)>1 else "SDLC-10"),
        "docs-export": pmops.pm_docs_export,
        "docs-select": lambda: pmops.pm_docs_select(a[0] if a else "SDLC"),
        "ai-summarize-sprint": pmops.pm_ai_summarize_sprint,
        "ai-summarize-epic": pmops.pm_ai_summarize_epic,
        "ai-generate-stories": pmops.pm_ai_generate_stories,
        "ai-generate-tasks": pmops.pm_ai_generate_tasks,
        "ai-estimate": lambda: pmops.pm_ai_estimate(a[0] if a else "SDLC-10"),
        "ai-roadmap": pmops.pm_ai_roadmap,
        "ai-analyze-blockers": pmops.pm_ai_analyze_blockers,
        "ai-release-notes": pmops.pm_ai_release_notes,
        "ai-standup-report": pmops.pm_ai_standup_report,
        "ai-sprint-review": pmops.pm_ai_sprint_review,
        "report-sprint": pmops.pm_report_sprint,
        "report-epic": pmops.pm_report_epic,
        "report-velocity": pmops.pm_report_velocity,
        "report-workload": pmops.pm_report_workload,
        "report-blockers": pmops.pm_report_blockers,
        "report-releases": pmops.pm_report_releases,
        "report-productivity": pmops.pm_report_productivity,
        "user-profile": sysops.run_user_profile,
        "user-permissions": sysops.run_user_permissions,
        "user-list": sysops.run_user_list,
        "config-view": sysops.run_config_view,
        "status": sysops.run_system_status,
        "health": sysops.run_system_health,
        "version": sysops.run_system_version,
        "doctor": sysops.run_system_doctor,
    }
    fn = handlers.get(c)
    if not fn:
        res, _, _ = await _handle_command(o, raw, session, nlp)
        return res
    r = await with_spinner("Processing...", fn)
    return {"title": f"Agile: {c}", "output": r if isinstance(r, list) else [str(r)]}
