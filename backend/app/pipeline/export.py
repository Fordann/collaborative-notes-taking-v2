import subprocess
from pathlib import Path


async def export_to_original_format(
    enriched_md: str,
    original_file_path: str,
    original_format: str,
) -> str:
    """Reconvertit le Markdown enrichi dans le format original."""

    original = Path(original_file_path)
    output_dir = original.parent / "output"
    output_dir.mkdir(exist_ok=True)

    md_path = output_dir / "enriched.md"
    md_path.write_text(enriched_md, encoding="utf-8")
    output_path = output_dir / f"enriched{original.suffix}"

    if original_format == "md":
        output_path.write_text(enriched_md, encoding="utf-8")

    elif original_format == "txt":
        subprocess.run(
            ["pandoc", str(md_path), "-t", "plain", "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    elif original_format == "docx":
        subprocess.run(
            ["pandoc", str(md_path), f"--reference-doc={original_file_path}", "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    elif original_format == "odt":
        subprocess.run(
            ["pandoc", str(md_path), "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    return str(output_path)
