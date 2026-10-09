"""Encode a bounded local raster for the existing authenticated Channel update."""
import base64
from pathlib import Path

MAX_ICON_BYTES = 256 * 1024


def icon_file_data_uri(filename: str) -> str:
    path = Path(filename).expanduser()
    if not path.is_absolute():
        raise ValueError("--icon-file requires an absolute PNG, JPEG, or WebP file path")
    try:
        if not path.is_file():
            raise ValueError("Icon path must be a regular local image file")
        with path.open("rb") as source:
            data = source.read(MAX_ICON_BYTES + 1)
    except OSError as error:
        raise ValueError(f"Cannot read icon file: {error.strerror}") from error
    if len(data) > MAX_ICON_BYTES:
        raise ValueError("Icon image exceeds 256 KiB; resize or compress it before uploading")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif data.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        raise ValueError("Icon file must contain PNG, JPEG, or WebP image bytes (not SVG or a URL)")
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
