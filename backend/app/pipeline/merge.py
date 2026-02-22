import json
import anthropic
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

MERGE_SYSTEM_PROMPT = """Tu es un assistant spécialisé dans la fusion de notes de cours.

Tu reçois les notes de plusieurs étudiants pour un même cours.
Chaque étudiant a capturé des informations différentes.

Ta tâche en deux étapes :

ÉTAPE 1 — RÉFÉRENTIEL
Construis le référentiel complet du cours en fusionnant toutes les notes.
Organise-le par sections thématiques dans l'ordre chronologique du cours.
Pour chaque information, note quel(s) étudiant(s) l'ont capturée.

ÉTAPE 2 — ANALYSE DES MANQUES
Pour chaque étudiant, identifie les informations présentes dans le
référentiel mais absentes de ses notes. Pour chaque manque, indique :
- L'information manquante (texte complet, prêt à être inséré)
- Après quelle section/paragraphe de SES notes elle devrait être insérée
  (utilise le titre de section ou les premiers mots du paragraphe comme ancre)
- La source (quel autre étudiant avait cette information)

Réponds UNIQUEMENT en JSON valide, sans blocs markdown, selon le schéma fourni."""


async def identify_gaps(notes: list) -> dict:
    """Envoie toutes les notes à Claude et retourne les manques par étudiant."""

    notes_text = ""
    for note in notes:
        notes_text += f"\n### Étudiant: {note.student_name} (id: {note.student_id})\n"
        notes_text += note.normalized_content + "\n"

    schema = json.dumps({
        "referentiel": {
            "sections": [
                {"title": "string", "content": "string", "captured_by": ["studentId"]}
            ]
        },
        "gaps": {
            "<studentId>": [
                {
                    "missing_content": "string — le texte à insérer",
                    "insert_after": "string — ancre textuelle dans les notes de l'étudiant",
                    "source_students": ["studentId"],
                    "topic": "string — sujet en quelques mots"
                }
            ]
        }
    }, indent=2, ensure_ascii=False)

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=8192,
        temperature=0,
        system=MERGE_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"## Notes des étudiants\n{notes_text}\n\n## Schéma de réponse attendu\n{schema}"
        }]
    )

    raw = response.content[0].text
    raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
    data = json.loads(raw)
    return data.get("gaps", {})
