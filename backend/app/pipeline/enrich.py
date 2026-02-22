import json
import anthropic
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

ENRICH_SYSTEM_PROMPT = """Tu es un assistant qui enrichit les notes d'un étudiant.

Tu reçois :
1. Les notes originales de l'étudiant (en Markdown)
2. Une liste d'informations manquantes à insérer (en JSON)

Règles :
- Insère chaque information manquante à l'endroit indiqué par "insert_after"
- Adapte le style d'écriture à celui de l'étudiant (niveau de détail,
  vocabulaire, utilisation d'abréviations, longueur des phrases)
- Marque CHAQUE ajout avec le préfixe "[AJOUT] " au début du paragraphe
  pour que l'étudiant puisse distinguer ses notes des ajouts
- Ne modifie JAMAIS le texte original de l'étudiant
- Si tu ne trouves pas l'ancre exacte, insère à l'endroit le plus logique

Retourne le document Markdown complet avec les ajouts intégrés."""


async def enrich_student_notes(note, gaps: list) -> str:
    """Produit le Markdown enrichi pour un étudiant."""

    if not gaps:
        return note.normalized_content

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=8192,
        temperature=0.3,
        system=ENRICH_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"## Notes originales de {note.student_name}\n\n"
                f"{note.normalized_content}\n\n"
                f"## Informations manquantes à insérer\n\n"
                f"{json.dumps(gaps, ensure_ascii=False, indent=2)}"
            )
        }]
    )

    return response.content[0].text
