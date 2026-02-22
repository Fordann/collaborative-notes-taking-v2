import subprocess


async def normalize_to_markdown(file_path: str, format: str) -> str:
    """Convertit un fichier en Markdown via Pandoc."""

    if format in ("md", "txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    # .docx et .odt → Pandoc
    result = subprocess.run(
        ["pandoc", file_path, "-t", "markdown", "--wrap=none"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"Pandoc error: {result.stderr}")

    return result.stdout
