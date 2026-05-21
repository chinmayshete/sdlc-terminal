"""CI/CD Pipeline utilities — replaces cicd.ts."""
from __future__ import annotations
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class PipelineStage:
    name: str; description: str; status: str = "pending"

@dataclass
class PipelineInfo:
    pipeline_type: str; has_jenkinsfile: bool; stages: list[PipelineStage] = field(default_factory=list)
    parameters: list[str] = field(default_factory=list)

async def get_pipeline_info(root_dir: str | Path) -> PipelineInfo:
    root = Path(root_dir)
    jf = root / "Jenkinsfile"
    if not jf.exists(): return PipelineInfo("none", False)
    content = jf.read_text(encoding="utf-8", errors="ignore")
    stages = []
    import re
    for m in re.finditer(r"stage\s*\(\s*['\"](.+?)['\"]\s*\)", content):
        stages.append(PipelineStage(m.group(1), f"Pipeline stage: {m.group(1)}"))
    params = []
    for m in re.finditer(r"(?:string|choice|booleanParam)\s*\(\s*name:\s*['\"](.+?)['\"]", content):
        params.append(m.group(1))
    return PipelineInfo("jenkins", True, stages, params)

async def validate_jenkinsfile(root_dir: str | Path) -> list[str]:
    root = Path(root_dir)
    jf = root / "Jenkinsfile"
    if not jf.exists(): return ["No Jenkinsfile found."]
    content = jf.read_text(encoding="utf-8", errors="ignore"); checks = []
    checks.append("✓ pipeline block" if "pipeline" in content else "✗ Missing pipeline block")
    checks.append("✓ agent block" if "agent" in content else "✗ Missing agent block")
    checks.append("✓ stages block" if "stages" in content else "✗ Missing stages block")
    checks.append("✓ post block" if "post" in content else "⚠ No post block (add cleanup)")
    return checks

def format_pipeline_info(info: PipelineInfo) -> list[str]:
    lines = [f"Pipeline: {info.pipeline_type}", f"Jenkinsfile: {'✓' if info.has_jenkinsfile else '✗'}"]
    if info.stages:
        lines.append(f"Stages ({len(info.stages)}):")
        for i, s in enumerate(info.stages): lines.append(f"  {i+1}. {s.name}")
    if info.parameters: lines.extend(["Parameters:", *(f"  • {p}" for p in info.parameters)])
    return lines
