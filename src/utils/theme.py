"""Theme & UI — replaces theme.ts + spinner.ts with Rich."""
from __future__ import annotations
import sys, io
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.spinner import Spinner as RichSpinner
from rich.live import Live
from rich.theme import Theme
from typing import TypeVar, Callable, Awaitable
T = TypeVar("T")

# Force UTF-8 stdout on Windows to prevent cp1252 charmap errors
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, io.UnsupportedOperation):
        if hasattr(sys.stdout, "buffer"):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

nexus_theme = Theme({"accent":"bold green","warning":"bold yellow","danger":"bold red",
    "success":"bold green","info":"bold cyan","subtle":"dim","primary":"bold dodger_blue2","secondary":"bold medium_purple1"})
console = Console(theme=nexus_theme)

def render_banner():
    lines = [("  _   _ _______   __ _   _  ____  ","green"),(" | \\ | |  ____| \\ \\/ / | | |/ ___| ","cyan"),
        (" |  \\| | |__     \\  /  | | | \\___ \\ ","dodger_blue2"),(" | . ` |  __|    /  \\  | | |  ___ \\ ","blue"),
        (" | |\\  | |____  / /\\ \\ | |_| |/____/ ","medium_purple1"),(" |_| \\_|______|/_/  \\_\\ \\___/|____/  ","magenta")]
    banner = Text()
    for t, c in lines: banner.append(t + "\n", style=c)
    banner.append("NEXUS: AI-powered SDLC terminal assistant", style="bold yellow")
    console.print(Panel(banner, border_style="dim", expand=False))

def panel(title: str, body: list[str]) -> Panel:
    return Panel("\n".join(body) or "No content.", title=f"[bold dodger_blue2]{title}[/]", border_style="dim cyan", expand=False, padding=(0, 1))

def print_panel(title: str, body: list[str]):
    console.print(panel(title, body))

def accent(t): return f"[accent]{t}[/]"
def warning(t): return f"[warning]{t}[/]"
def danger(t): return f"[danger]{t}[/]"
def success(t): return f"[success]{t}[/]"
def info(t): return f"[info]{t}[/]"

async def with_spinner(message: str, fn: Callable[[], Awaitable[T]]) -> T:
    with Live(RichSpinner("dots", text=Text(message, style="green")), console=console, transient=True):
        return await fn()
