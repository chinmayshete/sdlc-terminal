"""DevOps NL Parser for CI/CD, Jenkins, Docker, Kubernetes, Monitoring, Deploy, and Release operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class DevOpsIntent:
    command: str; args: list[str]; raw: str; source: str

_RULES = [
    # System commands (must be before more specific rules)
    (r"^(?:nexus\s+)?help$|^(?:what\s+can\s+you\s+do|list\s+commands)$", "help", []),
    (r"^(?:nexus\s+)?status$", "status", []),
    (r"^(?:nexus\s+)?version$", "version", []),
    (r"^(?:nexus\s+)?doctor$", "doctor", []),
    (r"^(?:nexus\s+)?config\s+view$", "config-view", []),

    # CI/CD & Jenkins
    (r"^(?:nexus\s+)?cicd$", "cicd", []),
    (r"^(?:nexus\s+)?jenkins\s+auth$", "jenkins-auth", []),
    (r"^(?:nexus\s+)?jenkins\s+jobs$", "jenkins-jobs", []),
    (r"^(?:nexus\s+)?jenkins\s+status$", "jenkins-status", []),
    (r"^(?:nexus\s+)?jenkins\s+validate$", "jenkins-validate", []),
    (r"^(?:nexus\s+)?jenkins\s+stages$", "jenkins-stages", []),
    (r"^(?:nexus\s+)?jenkins\s+params$", "jenkins-params", []),
    (r"^(?:nexus\s+)?actions$", "actions", []),
    (r"^(?:nexus\s+)?actions\s+validate$", "actions-validate", []),
    (r"^(?:nexus\s+)?pipeline\s+health$", "pipeline-health", []),

    # Docker
    (r"^(?:nexus\s+)?docker\s+images$", "docker-images", []),
    (r"^(?:nexus\s+)?docker\s+ps$", "docker-ps", []),
    (r"^(?:nexus\s+)?docker\s+info$", "docker-info", []),
    (r"^(?:nexus\s+)?docker\s+stages$", "docker-stages", []),
    (r"^(?:nexus\s+)?docker\s+validate$", "docker-validate", []),

    # Kubernetes
    (r"^(?:nexus\s+)?k8s\s+pods$", "k8s-pods", []),
    (r"^(?:nexus\s+)?k8s\s+services$", "k8s-services", []),

    # Monitoring
    (r"^(?:nexus\s+)?monitor\s+status$", "monitor-status", []),
    (r"^(?:nexus\s+)?monitor\s+logs$", "monitor-logs", []),
    (r"^(?:nexus\s+)?monitor\s+metrics$", "monitor-metrics", []),
    (r"^(?:nexus\s+)?monitor\s+alerts$", "monitor-alerts", []),
    (r"^(?:nexus\s+)?monitor\s+health$", "monitor-health", []),

    # Deployment
    (r"^(?:nexus\s+)?deploy\s+start$", "deploy-start", []),
    (r"^(?:nexus\s+)?deploy\s+status$", "deploy-status", []),
    (r"^(?:nexus\s+)?deploy\s+history$", "deploy-history", []),

    # Release
    (r"^(?:nexus\s+)?release\s+history$", "release-history", []),

    # Infrastructure & Dependencies
    (r"^(?:nexus\s+)?terraform\s+info$", "terraform-info", []),
    (r"^(?:nexus\s+)?infra\s+resources$", "infra-resources", []),
    (r"^(?:nexus\s+)?env\s+show$|^(?:nexus\s+)?config$", "env-show", []),
    (r"^(?:nexus\s+)?env\s+compare$", "env-compare", []),
    (r"^(?:nexus\s+)?env\s+validate$", "env-validate", []),
    (r"^(?:nexus\s+)?deps?\s+audit$", "deps-audit", []),
    (r"^(?:nexus\s+)?deps?\s+check$", "deps-check", []),
    (r"^(?:nexus\s+)?deps?\s+licenses?$", "deps-licenses", []),
    (r"^(?:nexus\s+)?scan$", "scan", []),
    (r"^(?:nexus\s+)?scan\s+errors$", "scan-errors", []),
    (r"^(?:nexus\s+)?secrets?\s+check$", "secrets-check", []),

    # Summary & Git
    (r"^(?:nexus\s+)?summary$", "summary", []),
    (r"^(?:nexus\s+)?health$", "health", []),
    (r"^(?:nexus\s+)?changed$", "changed", []),
    (r"^(?:nexus\s+)?pr\s+check$", "pr-check", []),
    (r"^(?:nexus\s+)?rollback$", "rollback", []),
]

_RULES_WITH_ARGS = [
    # Jenkins
    (r"^(?:nexus\s+)?jenkins\s+trigger\s+(\S+)$", "jenkins-trigger"),
    (r"^(?:nexus\s+)?jenkins\s+logs\s+(\S+)$", "jenkins-logs"),
    (r"^(?:nexus\s+)?jenkins\s+stop\s+(\S+)$", "jenkins-stop"),

    # Docker
    (r"^(?:nexus\s+)?docker\s+build(?:\s+(\S+))?$", "docker-build"),
    (r"^(?:nexus\s+)?docker\s+run\s+(\S+)$", "docker-run"),
    (r"^(?:nexus\s+)?docker\s+stop\s+(\S+)$", "docker-stop"),
    (r"^(?:nexus\s+)?docker\s+logs\s+(\S+)$", "docker-logs"),
    (r"^(?:nexus\s+)?docker\s+remove\s+(\S+)$", "docker-remove"),

    # Kubernetes
    (r"^(?:nexus\s+)?k8s\s+deploy\s+(\S+)$", "k8s-deploy"),
    (r"^(?:nexus\s+)?k8s\s+logs\s+(\S+)$", "k8s-logs"),
    (r"^(?:nexus\s+)?k8s\s+scale\s+(\S+)\s+(\d+)$", "k8s-scale"),
    (r"^(?:nexus\s+)?k8s\s+restart\s+(\S+)$", "k8s-restart"),
    (r"^(?:nexus\s+)?k8s\s+delete\s+(\S+)$", "k8s-delete"),

    # Deploy & Release
    (r"^(?:nexus\s+)?deploy\s+rollback\s+(\S+)$", "deploy-rollback"),
    (r"^(?:nexus\s+)?deploy\s+check\s+(\S+)$", "deploy-check"),
    (r"^(?:nexus\s+)?release\s+create\s+(\S+)$", "release-create"),
    (r"^(?:nexus\s+)?release\s+deploy\s+(\S+)\s+(\S+)$", "release-deploy"),
    (r"^(?:nexus\s+)?release\s+notes\s+(\S+)$", "release-notes"),
    (r"^(?:nexus\s+)?release\s+rollback\s+(\S+)$", "release-rollback"),
    (r"^(?:nexus\s+)?release\s+(\S+)$", "release"),
    (r"^(?:nexus\s+)?hotfix\s+(\S+)$", "hotfix"),

    # Git
    (r"^(?:nexus\s+)?merge\s+(\S+)$", "merge"),
    (r"^(?:nexus\s+)?push\s+(\S+)$", "push"),
    (r"^(?:nexus\s+)?rollback\s+([a-f0-9]+)$", "rollback"),
]

def parse_devops_intent(text: str) -> DevOpsIntent:
    t = re.sub(r"^nexus\s+", "", text.strip(), flags=re.IGNORECASE).strip()
    for pattern, cmd, args in _RULES:
        if re.match(pattern, t, re.IGNORECASE): return DevOpsIntent(cmd, args, t, "rule")
    for pattern, cmd in _RULES_WITH_ARGS:
        m = re.match(pattern, t, re.IGNORECASE)
        if m:
            args = [g for g in m.groups() if g]
            return DevOpsIntent(cmd, args, t, "rule")
    return DevOpsIntent("unknown", [], t, "unknown")

async def parse_devops_intent_with_llm(text: str) -> DevOpsIntent:
    r = parse_devops_intent(text)
    if r.command != "unknown": return r
    prompt = '''DevOps command parser. Return JSON: {"command": str, "args": str[]}. If the user input is conversational, feedback, correction, or a general natural language task request rather than a direct DevOps CLI command, you MUST return {"command": "unknown", "args": []}.
    Valid: help, status, version, doctor, config-view, cicd, jenkins-auth, jenkins-jobs, jenkins-status, jenkins-trigger, jenkins-logs, jenkins-stop, jenkins-validate, jenkins-stages, jenkins-params, actions, actions-validate, pipeline-health, docker-build, docker-run, docker-stop, docker-images, docker-ps, docker-logs, docker-remove, docker-info, docker-stages, docker-validate, k8s-deploy, k8s-pods, k8s-services, k8s-logs, k8s-scale, k8s-restart, k8s-delete, monitor-status, monitor-logs, monitor-metrics, monitor-alerts, monitor-health, deploy-start, deploy-rollback, deploy-status, deploy-history, deploy-check, release-create, release-deploy, release-notes, release-rollback, release-history, release, hotfix, terraform-info, infra-resources, env-show, env-compare, env-validate, deps-audit, deps-check, deps-licenses, scan, scan-errors, secrets-check, summary, health, changed, pr-check, merge, rollback, push.'''
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: return DevOpsIntent(parsed["command"], parsed["args"], text, "llm")
    return r

def get_devops_command_help() -> list[str]:
    return [
        "[bold cyan]── Jenkins CI & GitHub Actions ──[/]",
        "  [bold yellow]jenkins auth / status[/]   Check Jenkins master status",
        "  [bold yellow]jenkins jobs / trigger[/] Inspect pipeline jobs and trigger builds",
        "  [bold yellow]actions / validate[/]     Inspect and validate GitHub Actions workflows",
        "",
        "[bold cyan]── Docker Containerization ──[/]",
        "  [bold yellow]docker build / run[/]      Build images and run containers",
        "  [bold yellow]docker ps / images[/]    List running containers and local images",
        "",
        "[bold cyan]── Kubernetes Orchestration ──[/]",
        "  [bold yellow]k8s pods / services[/]   Inspect production pods and cluster IP services",
        "  [bold yellow]k8s deploy / scale[/]    Apply YAML manifests and scale replica sets",
        "",
        "[bold cyan]── Monitoring & APM ──[/]",
        "  [bold yellow]monitor status/metrics[/] Check Prometheus engine and APM telemetry",
        "",
        "[bold cyan]── Deployment & Releases ──[/]",
        "  [bold yellow]deploy start / history[/] Initiate production rollouts and inspect audit logs",
        "  [bold yellow]release create/notes[/]   Tag semantic releases and generate AI changelogs",
        "",
        "  [bold dim]exit[/]               Leave DevOps mode"
    ]
