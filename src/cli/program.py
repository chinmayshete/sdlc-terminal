"""CLI Program — replaces program.ts. Click-based CLI commands."""
from __future__ import annotations
import asyncio, click
from ..core.orchestrator import Orchestrator
from ..utils.code_scanner import format_scan_report
from ..utils.cicd import format_pipeline_info, get_pipeline_info
from ..config.paths import paths

def _run(coro): return asyncio.get_event_loop().run_until_complete(coro) if asyncio.get_event_loop().is_running() else asyncio.run(coro)

@click.group()
@click.version_option("0.1.0", prog_name="nexus")
def cli(): """Nexus: AI-powered SDLC terminal assistant."""; pass

@cli.command()
def configure():
    """Interactively configure LLM credentials."""
    import click
    from pathlib import Path
    click.echo("--- Nexus AI Configuration ---")
    provider = click.prompt("Choose provider", type=click.Choice([
        "gemini", "anthropic", "bedrock", "nvidia", "mistral", "azure_ai_foundry", "open_source", "azure", "generic"
    ]), default="azure")
    
    env_content = f"LLM_PROVIDER={provider}\n"
    if provider == "gemini":
        api_key = click.prompt("Gemini API Key", hide_input=True)
        model = click.prompt("Gemini Model Name", default="gemini-2.5-flash")
        env_content += f"GEMINI_API_KEY={api_key.strip()}\nGEMINI_MODEL={model.strip()}\n"
    elif provider == "anthropic":
        api_key = click.prompt("Anthropic API Key", hide_input=True)
        model = click.prompt("Anthropic Model Name", default="claude-3-5-sonnet-latest")
        env_content += f"ANTHROPIC_API_KEY={api_key.strip()}\nANTHROPIC_MODEL={model.strip()}\n"
    elif provider == "bedrock":
        key_id = click.prompt("AWS Access Key ID", hide_input=True)
        secret_key = click.prompt("AWS Secret Access Key", hide_input=True)
        region = click.prompt("AWS Region", default="us-east-1")
        model_id = click.prompt("Bedrock Model ID", default="anthropic.claude-3-5-sonnet-20241022-v2:0")
        env_content += (
            f"AWS_ACCESS_KEY_ID={key_id.strip()}\n"
            f"AWS_SECRET_ACCESS_KEY={secret_key.strip()}\n"
            f"AWS_REGION={region.strip()}\n"
            f"BEDROCK_MODEL_ID={model_id.strip()}\n"
        )
    elif provider == "nvidia":
        api_key = click.prompt("NVIDIA API Key", hide_input=True)
        model = click.prompt("NVIDIA Model Name", default="meta/llama-3.1-70b-instruct")
        env_content += f"NVIDIA_API_KEY={api_key.strip()}\nNVIDIA_MODEL={model.strip()}\n"
    elif provider == "mistral":
        api_key = click.prompt("Mistral API Key", hide_input=True)
        model = click.prompt("Mistral Model Name", default="mistral-large-latest")
        env_content += f"MISTRAL_API_KEY={api_key.strip()}\nMISTRAL_MODEL={model.strip()}\n"
    elif provider == "azure_ai_foundry":
        endpoint = click.prompt("Foundry Endpoint (URL)")
        api_key = click.prompt("Foundry API Key", hide_input=True)
        model = click.prompt("Foundry Model Name")
        env_content += (
            f"FOUNDRY_ENDPOINT={endpoint.strip()}\n"
            f"FOUNDRY_API_KEY={api_key.strip()}\n"
            f"FOUNDRY_MODEL={model.strip()}\n"
        )
    elif provider == "open_source":
        base_url = click.prompt("OS Base URL (Ollama/vLLM)", default="http://localhost:11434/v1")
        model = click.prompt("OS Model Name", default="llama3")
        api_key = click.prompt("OS API Key (optional)", default="", show_default=False)
        env_content += (
            f"OS_BASE_URL={base_url.strip()}\n"
            f"OS_MODEL={model.strip()}\n"
        )
        if api_key.strip():
            env_content += f"OS_API_KEY={api_key.strip()}\n"
    elif provider == "azure":
        endpoint = click.prompt("Azure OpenAI Endpoint (e.g. https://your-endpoint.openai.azure.com/)")
        api_key = click.prompt("Azure OpenAI API Key", hide_input=True)
        deployment = click.prompt("Azure OpenAI Deployment Name", default="gpt-4.1")
        api_version = click.prompt("Azure OpenAI API Version", default="2024-12-01-preview")
        env_content += (
            f"AZURE_OPENAI_ENDPOINT={endpoint.strip()}\n"
            f"AZURE_OPENAI_API_KEY={api_key.strip()}\n"
            f"AZURE_OPENAI_DEPLOYMENT={deployment.strip()}\n"
            f"AZURE_OPENAI_API_VERSION={api_version.strip()}\n"
        )
    elif provider == "generic":
        base_url = click.prompt("Generic LLM Base URL (e.g. https://api.openai.com/v1)")
        api_key = click.prompt("Generic LLM API Key", hide_input=True)
        model = click.prompt("Generic LLM Model Name", default="gpt-4o")
        env_content += (
            f"LLM_BASE_URL={base_url.strip()}\n"
            f"LLM_API_KEY={api_key.strip()}\n"
            f"LLM_MODEL={model.strip()}\n"
        )
        
    home_env = Path.home() / ".nexus_env"
    try:
        home_env.write_text(env_content, encoding="utf-8")
        from ..utils.system_operations import update_env_var
        for line in env_content.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                update_env_var(k, v)
        click.echo(f"\nConfiguration saved successfully to {home_env} and local env!")
    except Exception as e:
        click.echo(f"\nError saving configuration: {e}")

@cli.command()
def tickets():
    """List all tickets from Jira."""
    o = Orchestrator(); ts = asyncio.run(o.list_tickets())
    if not ts: click.echo("No tickets found."); return
    for t in ts: click.echo(f"{t.id} — {t.title} [{t.priority}]")

@cli.command()
@click.argument("ticket_id")
def plan(ticket_id):
    """Generate plan for a ticket."""
    o = Orchestrator(); p = asyncio.run(o.plan(ticket_id))
    for i, s in enumerate(p.steps): click.echo(f"{i+1}. {s}")

@cli.command()
@click.argument("ticket_id")
def execute(ticket_id):
    """Run the full ticket execution flow."""
    o = Orchestrator(); r = asyncio.run(o.execute(ticket_id))
    click.echo(f"Files: {', '.join(r.updated_files) or 'none'}")
    click.echo(f"Tests: {', '.join(r.generated_tests) or 'none'}")
    click.echo(f"Status: {r.ticket_status}")

@cli.command()
def status():
    """Show ticket workflow status."""
    o = Orchestrator(); s = asyncio.run(o.status())
    click.echo(f"AI: {s.ai_mode} ({'configured' if s.ai_configured else 'not configured'})")
    for t in s.tickets: click.echo(f"  {t.ticket_id}: {t.status}")

@cli.command()
def ai():
    """Check AI health."""
    o = Orchestrator(); h = asyncio.run(o.ai_health())
    click.echo(f"Mode: {h.mode} | Configured: {h.configured} | Reachable: {h.reachable}")

@cli.command()
@click.argument("ticket_id")
def push(ticket_id):
    """Push a ticket branch."""
    o = Orchestrator(); click.echo(asyncio.run(o.push(ticket_id)))

@cli.command()
def scan():
    """Run security scan."""
    o = Orchestrator(); r = asyncio.run(o.run_code_scan())
    for l in format_scan_report(r): click.echo(l)

@cli.command()
def terminal():
    """Start the interactive terminal."""
    from ..cli.terminal import run_terminal
    o = Orchestrator(); asyncio.run(run_terminal(o))

@cli.command()
@click.option("--port", default=9500, help="API server port (default: 9500)")
@click.option("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
def serve(port, host):
    """Start the Nexus API server for the VS Code extension."""
    try:
        import uvicorn
    except ImportError:
        click.echo("Error: uvicorn is required. Install with: pip install uvicorn[standard]")
        return
    from ..server.server import app
    click.echo(f"Starting Nexus API server on http://{host}:{port}")
    click.echo("Press Ctrl+C to stop.")
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    cli()
