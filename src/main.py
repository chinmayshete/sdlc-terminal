"""Nexus CLI — Entry Point. Replaces index.ts."""
from __future__ import annotations
import asyncio, sys

def main():
    """Main entry point — launches the interactive terminal by default, or runs CLI command."""
    import sys
    try:
        if len(sys.argv) > 1:
            from src.cli.program import cli
            cli()
        else:
            from src.core.orchestrator import Orchestrator
            from src.cli.terminal import run_terminal
            orchestrator = Orchestrator()
            asyncio.run(run_terminal(orchestrator))
    except KeyboardInterrupt:
        print("\nSession closed.")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
