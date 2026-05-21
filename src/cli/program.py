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
