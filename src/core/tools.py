"""Nexus Agent Tools — functions mapping to the agent's executable actions."""
from __future__ import annotations
import asyncio
import os
import shutil
from pathlib import Path
from ..config.paths import paths

async def run_command_tool(cmd: str) -> dict:
    """Executes a shell command in the workspace and returns stdout/stderr."""
    proc = None
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(paths["root_dir"])
        )
        stdout, stderr = await proc.communicate()
        return {
            "success": proc.returncode == 0,
            "stdout": stdout.decode("utf-8", errors="ignore"),
            "stderr": stderr.decode("utf-8", errors="ignore"),
            "exit_code": proc.returncode
        }
    except asyncio.CancelledError:
        if proc:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        raise
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "exit_code": -1
        }

def read_file_tool(path: str) -> dict:
    """Reads the contents of a file in the workspace."""
    try:
        full_path = (paths["root_dir"] / path).resolve()
        if not str(full_path).startswith(str(paths["root_dir"])):
            return {"success": False, "error": "Access denied: outside workspace"}
        if not full_path.exists():
            return {"success": False, "error": "File not found"}
        if not full_path.is_file():
            return {"success": False, "error": "Not a file"}
        content = full_path.read_text(encoding="utf-8", errors="ignore")
        return {"success": True, "content": content}
    except Exception as e:
        return {"success": False, "error": str(e)}

def edit_file_tool(path: str, content: str, action: str = "update") -> dict:
    """Modifies a file in the workspace (create, update, or delete)."""
    try:
        full_path = (paths["root_dir"] / path).resolve()
        if not str(full_path).startswith(str(paths["root_dir"])):
            return {"success": False, "error": "Access denied: outside workspace"}
        
        if action == "delete":
            if full_path.exists():
                if full_path.is_file():
                    full_path.unlink()
                elif full_path.is_dir():
                    shutil.rmtree(full_path)
                return {"success": True, "message": f"Deleted {path}"}
            return {"success": False, "error": "Path does not exist"}
        
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")
        return {"success": True, "message": f"Successfully wrote to {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def list_dir_tool(path: str = ".") -> dict:
    """Lists files and directories in a workspace folder."""
    try:
        full_path = (paths["root_dir"] / path).resolve()
        if not str(full_path).startswith(str(paths["root_dir"])):
            return {"success": False, "error": "Access denied: outside workspace"}
        if not full_path.exists():
            return {"success": False, "error": "Directory not found"}
        
        entries = []
        for item in full_path.iterdir():
            entries.append({
                "name": item.name,
                "is_dir": item.is_dir(),
                "size": item.stat().st_size if item.is_file() else None
            })
        return {"success": True, "entries": entries}
    except Exception as e:
        return {"success": False, "error": str(e)}
