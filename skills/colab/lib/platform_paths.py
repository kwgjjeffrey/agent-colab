"""Platform-owned Agent Colab locations shared by the Python entry points."""
from __future__ import annotations

import os
import pathlib
import platform
import sys
try:
    from .artifact_config import artifact_config
except ImportError:
    from artifact_config import artifact_config


def application_root() -> pathlib.Path:
    """Return mutable application state outside any source checkout."""
    override = os.environ.get("COLAB_APPLICATION_ROOT")
    if override:
        return pathlib.Path(override)
    name = artifact_config()["skill"]["name"]
    if sys.platform == "win32":
        windows_name = "".join(part.title() for part in name.split("-"))
        local = os.environ.get("LOCALAPPDATA")
        return pathlib.Path(local) / windows_name if local else pathlib.Path.home() / "AppData/Local" / windows_name
    return pathlib.Path.home() / ".local/share" / name


def platform_id() -> tuple[str, str]:
    system = "windows" if sys.platform == "win32" else "darwin" if sys.platform == "darwin" else "linux"
    machine = platform.machine().lower()
    arch = "x86_64" if machine in {"amd64", "x86_64"} else "arm64" if machine in {"arm64", "aarch64"} else machine
    return system, arch


def application_identity():
    return artifact_config()["application"]
