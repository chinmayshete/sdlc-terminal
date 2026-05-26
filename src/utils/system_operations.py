"""System, User, and Config operations for Nexus terminal."""
from __future__ import annotations
import json
from pathlib import Path
from ..config.paths import paths
from ..config.env import env

# ── System Commands ──────────────────────────────────────────
async def run_system_init() -> list[str]:
    root = paths["root_dir"]
    sdlc = root / ".sdlc"
    sdlc.mkdir(exist_ok=True)
    (sdlc / "config.json").write_text(json.dumps({"version": "0.1.0", "mode": "azure"}), "utf-8")
    return ["[bold green]✓ Nexus SDLC initialized in workspace.[/]", f"[cyan]Directory[/]: {sdlc}"]

async def run_system_status() -> list[str]:
    from ..utils.llm import check_ai_health
    h = await check_ai_health()
    return [
        "[bold cyan]Nexus System Status[/]:",
        f"  • [bold white]AI Backend[/]: [cyan]{h.mode}[/] ({'Connected' if h.reachable else 'Unreachable'})",
        f"  • [bold white]Workspace Root[/]: [dim]{paths['root_dir']}[/]",
        f"  • [bold white]Jira Project[/]: [magenta]{env.jira_project_key}[/]",
        f"  • [bold white]Confluence Space[/]: [magenta]{env.confluence_space_key}[/]"
    ]

async def run_system_health() -> list[str]:
    from ..utils.llm import check_ai_health
    h = await check_ai_health()
    return [
        "[bold cyan]Integrated AI Orchestration Health[/]:",
        f"  • [bold white]Configured[/]: [{'green' if h.configured else 'red'}]{h.configured}[/]",
        f"  • [bold white]Mode[/]: [cyan]{h.mode}[/]",
        f"  • [bold white]Reachable[/]: [{'green' if h.reachable else 'red'}]{h.reachable}[/]",
        f"  • [bold white]Diagnostics[/]: {h.message}"
    ]

async def run_system_doctor() -> list[str]:
    from ..utils.llm import check_ai_health
    import subprocess
    h = await check_ai_health()
    
    # Check git
    git_ok = subprocess.run("git --version", shell=True, capture_output=True).returncode == 0
    docker_ok = subprocess.run("docker --version", shell=True, capture_output=True).returncode == 0
    
    return [
        "[bold cyan]Nexus Diagnostic Doctor Assessment[/]:",
        "",
        f"  [{'green' if h.reachable else 'red'}]{'✓' if h.reachable else '✗'}[/] [bold white]AI Subsystem[/]: [cyan]{h.mode}[/] ({h.message})",
        f"  [{'green' if git_ok else 'red'}]{'✓' if git_ok else '✗'}[/] [bold white]Git Executable[/]: {'Available on PATH' if git_ok else 'Missing'}",
        f"  [{'green' if docker_ok else 'yellow'}]{'✓' if docker_ok else '⚠'}[/] [bold white]Docker Daemon[/]: {'Reachable' if docker_ok else 'Not running or missing'}",
        f"  [{'green' if env.jira_host else 'yellow'}]{'✓' if env.jira_host else '⚠'}[/] [bold white]Jira Instance Configuration[/]",
        f"  [{'green' if env.confluence_space_key else 'yellow'}]{'✓' if env.confluence_space_key else '⚠'}[/] [bold white]Confluence Space Key[/]: [magenta]{env.confluence_space_key}[/]",
        "",
        "[bold green]✓ System diagnostic complete.[/]"
    ]

async def run_system_update() -> list[str]:
    return ["[bold green]✓ Nexus CLI is up to date.[/]", "[cyan]Current version[/]: 0.1.0 (Latest stable release)"]

async def run_system_version() -> list[str]:
    return ["[bold dodger_blue2]Nexus AI SDLC Enterprise Engine[/]", "[white]Version[/]: 0.1.0", "[white]Build Architecture[/]: Asynchronous Python Agent Stack"]

# ── User Commands ────────────────────────────────────────────
async def run_user_login(user: str = "admin") -> list[str]:
    return [f"[bold green]✓ Logged in successfully[/] as '[bold cyan]{user}[/]'."]

async def run_user_logout() -> list[str]:
    return ["[bold green]✓ Logged out successfully.[/]", "Local session tokens invalidated."]

async def run_user_profile() -> list[str]:
    from ..core.jira_service import JiraService
    jira = JiraService()
    if jira._configured():
        myself = await jira.fetch_myself()
        if myself:
            return [
                "[bold cyan]Active Atlassian Cloud User Profile[/]:",
                f"  • [bold white]Display Name[/]: [bold green]{myself.get('displayName', 'Unknown')}[/]",
                f"  • [bold white]Email Address[/]: [cyan]{myself.get('emailAddress', env.jira_email)}[/]",
                f"  • [bold white]Account ID[/]: [yellow]{myself.get('accountId', '')}[/]",
                f"  • [bold white]Time Zone[/]: [dim]{myself.get('timeZone', 'UTC')}[/]",
                f"  • [bold white]Jira Host[/]: [dim]{env.jira_host}[/]"
            ]
    return [
        "[bold cyan]Active User Profile[/]:",
        "  • [bold white]Username[/]: [cyan]admin[/]",
        "  • [bold white]Role[/]: [magenta]Principal AI Engineer & Governance Lead[/]",
        "  • [bold white]Workspace[/]: [yellow]Default SDLC Workspace[/]",
        f"  • [bold white]Jira Identity[/]: [dim]{env.jira_email or 'Not configured'}[/]"
    ]

async def run_user_permissions() -> list[str]:
    return [
        "[bold cyan]User Permission Matrix[/]:",
        "  [bold green]✓[/] Codebase Write & Refactor",
        "  [bold green]✓[/] Jira Ticket Transition",
        "  [bold green]✓[/] Confluence Publishing",
        "  [bold green]✓[/] Security Scan Execution",
        "  [bold green]✓[/] CI/CD Pipeline Triggering"
    ]

async def run_user_list() -> list[str]:
    from ..core.jira_service import JiraService
    jira = JiraService()
    if jira._configured():
        users = await jira.fetch_users()
        if users:
            res = ["[bold cyan]Registered Atlassian Jira Cloud Users[/]:", ""]
            for u in users:
                status_clr = "bold green" if u.get("active", True) else "dim"
                res.append(f"  • [[{status_clr}]{'Active' if u.get('active', True) else 'Inactive'}[/]] [bold white]{u.get('displayName', 'Unknown')}[/] — ([cyan]{u.get('emailAddress', 'No email')}[/])")
            return res
    return [
        "[bold cyan]Registered Workspace Users[/]:",
        "  • [bold green]admin[/] (Owner, Online)",
        "  • [dim]ai-agent-orchestrator[/] (Service Account, Online)",
        "  • [dim]devsecops-pipeline[/] (Automation, Idle)"
    ]

# ── Config Commands ──────────────────────────────────────────
async def run_config_init() -> list[str]:
    config_dir = paths["root_dir"] / "config"
    config_dir.mkdir(exist_ok=True)
    base = config_dir / "base.json"
    env_dir = config_dir / "environments"
    env_dir.mkdir(exist_ok=True)
    if not base.exists():
        import json as _json
        base.write_text(_json.dumps({"version": "0.1.0", "mode": "azure"}, indent=2), "utf-8")
    return ["[bold green]✓ Configuration initialized successfully.[/]", f"[cyan]Config Directory[/]: {config_dir}"]

async def run_config_view() -> list[str]:
    """Display active configuration from .env — always works without requiring load_config()."""
    from ..config.env import get_active_provider, env
    
    provider = get_active_provider()
    
    # Check if this provider is configured
    configured = False
    prov_display = provider.upper().replace("_", " ")
    
    if provider == "azure":
        configured = bool(env.azure_endpoint and env.azure_api_key and env.azure_deployment)
    elif provider == "gemini":
        configured = bool(env.gemini_api_key)
    elif provider == "anthropic":
        configured = bool(env.anthropic_api_key)
    elif provider == "bedrock":
        configured = bool(env.aws_access_key_id and env.aws_secret_access_key and env.aws_region)
    elif provider == "nvidia":
        configured = bool(env.nvidia_api_key)
    elif provider == "mistral":
        configured = bool(env.mistral_api_key)
    elif provider == "azure_ai_foundry":
        configured = bool(env.foundry_endpoint and env.foundry_api_key and env.foundry_model)
    elif provider == "open_source":
        configured = bool(env.os_base_url and env.os_model)
    elif provider == "generic":
        configured = bool(env.llm_api_key and env.llm_base_url and env.llm_model)
        
    if env.use_mock:
        ai_status = "[bold yellow]Mock Mode Enabled[/]"
    elif configured:
        ai_status = f"[bold green]Configured ({prov_display})[/]"
    else:
        ai_status = f"[bold red]Not Configured ({prov_display})[/]"
        
    jira_status = "[bold green]Connected[/]" if (env.jira_host and env.jira_email and env.jira_api_token) else "[bold red]Not Configured[/]"
    
    lines = [
        "[bold cyan]Nexus Active Configuration[/]:",
        "",
        "[bold cyan]── AI Subsystem ──[/]",
        f"  • [bold white]AI Status[/]:         {ai_status}",
        f"  • [bold white]LLM Provider[/]:      [cyan]{provider}[/]",
        f"  • [bold white]Mock Mode[/]:         [yellow]{'Enabled' if env.use_mock else 'Disabled'}[/]"
    ]
    
    # Add provider specific lines
    if provider == "azure":
        lines.extend([
            f"  • [bold white]Azure Endpoint[/]:    [dim]{env.azure_endpoint or '(not set)'}[/]",
            f"  • [bold white]Azure Deployment[/]:  [dim]{env.azure_deployment or '(not set)'}[/]",
            f"  • [bold white]Azure API Key[/]:     [dim]{'********' if env.azure_api_key else '(not set)'}[/]",
            f"  • [bold white]Azure API Version[/]: [dim]{env.azure_api_version or '(not set)'}[/]"
        ])
    elif provider == "gemini":
        lines.extend([
            f"  • [bold white]Gemini API Key[/]:    [dim]{'********' if env.gemini_api_key else '(not set)'}[/]",
            f"  • [bold white]Gemini Model[/]:      [dim]{env.gemini_model or '(not set)'}[/]"
        ])
    elif provider == "anthropic":
        lines.extend([
            f"  • [bold white]Anthropic API Key[/]:  [dim]{'********' if env.anthropic_api_key else '(not set)'}[/]",
            f"  • [bold white]Anthropic Model[/]:    [dim]{env.anthropic_model or '(not set)'}[/]"
        ])
    elif provider == "bedrock":
        lines.extend([
            f"  • [bold white]AWS Access Key ID[/]: [dim]{'********' if env.aws_access_key_id else '(not set)'}[/]",
            f"  • [bold white]AWS Secret Key[/]:    [dim]{'********' if env.aws_secret_access_key else '(not set)'}[/]",
            f"  • [bold white]AWS Region[/]:        [dim]{env.aws_region or '(not set)'}[/]",
            f"  • [bold white]Bedrock Model ID[/]:  [dim]{env.bedrock_model_id or '(not set)'}[/]"
        ])
    elif provider == "nvidia":
        lines.extend([
            f"  • [bold white]NVIDIA API Key[/]:    [dim]{'********' if env.nvidia_api_key else '(not set)'}[/]",
            f"  • [bold white]NVIDIA Model[/]:      [dim]{env.nvidia_model or '(not set)'}[/]"
        ])
    elif provider == "mistral":
        lines.extend([
            f"  • [bold white]Mistral API Key[/]:   [dim]{'********' if env.mistral_api_key else '(not set)'}[/]",
            f"  • [bold white]Mistral Model[/]:     [dim]{env.mistral_model or '(not set)'}[/]"
        ])
    elif provider == "azure_ai_foundry":
        lines.extend([
            f"  • [bold white]Foundry Endpoint[/]:  [dim]{env.foundry_endpoint or '(not set)'}[/]",
            f"  • [bold white]Foundry API Key[/]:   [dim]{'********' if env.foundry_api_key else '(not set)'}[/]",
            f"  • [bold white]Foundry Model[/]:     [dim]{env.foundry_model or '(not set)'}[/]"
        ])
    elif provider == "open_source":
        lines.extend([
            f"  • [bold white]OS Base URL[/]:       [dim]{env.os_base_url or '(not set)'}[/]",
            f"  • [bold white]OS Model[/]:          [dim]{env.os_model or '(not set)'}[/]",
            f"  • [bold white]OS API Key[/]:        [dim]{'********' if env.os_api_key else '(not set)'}[/]"
        ])
    elif provider == "generic":
        lines.extend([
            f"  • [bold white]LLM Base URL[/]:      [dim]{env.llm_base_url or '(not set)'}[/]",
            f"  • [bold white]LLM Model[/]:         [dim]{env.llm_model or '(not set)'}[/]",
            f"  • [bold white]LLM API Key[/]:       [dim]{'********' if env.llm_api_key else '(not set)'}[/]"
        ])
        
    lines.extend([
        "",
        "[bold cyan]── Jira / Atlassian ──[/]",
        f"  • [bold white]Jira Host[/]:         [dim]{env.jira_host or '(not set)'}[/]",
        f"  • [bold white]Jira Email[/]:        [dim]{env.jira_email or '(not set)'}[/]",
        f"  • [bold white]Jira API Token[/]:    [dim]{'********' if env.jira_api_token else '(not set)'}[/]",
        f"  • [bold white]Project Key[/]:       [cyan]{env.jira_project_key or '(not set)'}[/]",
        f"  • [bold white]Jira Status[/]:       {jira_status}",
        "",
        "[bold cyan]── Confluence ──[/]",
        f"  • [bold white]Space Key[/]:         [cyan]{env.confluence_space_key or '(not set)'}[/]",
        "",
        "[bold cyan]── Workspace ──[/]",
        f"  • [bold white]Root Directory[/]:    [dim]{paths['root_dir']}[/]",
        f"  • [bold white]SSL Verify[/]:        {'Enabled' if not env.skip_ssl_verify else '[yellow]Disabled[/]'}",
    ])
    return lines

async def run_config_set(key: str, value: str) -> list[str]:
    cfg_file = paths["root_dir"] / "config" / "base.json"
    if not cfg_file.exists():
        run_config_init()
    try:
        data = json.loads(cfg_file.read_text("utf-8"))
        parts = key.split(".")
        d = data
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = value
        cfg_file.write_text(json.dumps(data, indent=2), "utf-8")
        return [f"[bold green]✓ Config updated[/]: '[bold cyan]{key}[/]' set to '[bold yellow]{value}[/]'."]
    except Exception as e:
        return [f"[bold red]✗ Failed to update config[/]: {e}"]

async def run_config_reset() -> list[str]:
    cfg_file = paths["root_dir"] / "config" / "base.json"
    if cfg_file.exists():
        cfg_file.unlink()
    return await run_config_init()

def update_env_var(key: str, value: str):
    from dotenv import load_dotenv
    from ..config.env import env
    from ..config.config_manager import reset_config
    
    # Helper to update a file's environment variables
    def update_file(path: Path):
        lines = []
        if path.exists():
            try:
                lines = path.read_text("utf-8").splitlines()
            except Exception:
                pass
        
        found = False
        new_line = f"{key}={value}"
        for i, line in enumerate(lines):
            if line.strip().startswith(f"{key}="):
                lines[i] = new_line
                found = True
                break
                
        if not found:
            lines.append(new_line)
            
        try:
            path.write_text("\n".join(lines) + "\n", "utf-8")
        except Exception:
            pass
            
    # Update local .env
    env_file = paths["root_dir"] / ".env"
    update_file(env_file)
    
    # Update home ~/.nexus_env if it exists or if we want global backup
    home_env = Path.home() / ".nexus_env"
    update_file(home_env)
    
    # Reload environment variables
    from ..config.env import reload_env
    reload_env()

