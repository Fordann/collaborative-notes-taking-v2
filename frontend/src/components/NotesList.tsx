import { List, ListItem, ListItemText, IconButton, Chip, Typography, Paper, Box } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import { useDeleteNoteMutation, type StudentNote } from '../api/sessionsApi';
import { useUIStore } from '../stores/uiStore';

const formatLabels: Record<string, string> = {
  docx: 'Word',
  md: 'Markdown',
  txt: 'Texte',
  odt: 'ODT',
};

interface NotesListProps {
  sessionId: string;
  notes: StudentNote[];
  canDelete: boolean;
}

export default function NotesList({ sessionId, notes, canDelete }: NotesListProps) {
  const [deleteNote] = useDeleteNoteMutation();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const handleDelete = async (studentId: string) => {
    try {
      await deleteNote({ sessionId, studentId }).unwrap();
      showSnackbar('Note supprimée', 'success');
    } catch (err: any) {
      showSnackbar(err?.data?.detail || 'Erreur lors de la suppression', 'error');
    }
  };

  if (notes.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography color="text.secondary" textAlign="center">
          Aucune note uploadée pour le moment
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <Typography variant="h6">Notes uploadées ({notes.length})</Typography>
      </Box>
      <List>
        {notes.map((note) => (
          <ListItem
            key={note.student_id}
            secondaryAction={
              canDelete && (
                <IconButton edge="end" onClick={() => handleDelete(note.student_id)}>
                  <DeleteIcon />
                </IconButton>
              )
            }
          >
            <DescriptionIcon sx={{ mr: 2, color: 'grey.500' }} />
            <ListItemText
              primary={note.student_name}
              secondary={`ID: ${note.student_id} — ${new Date(note.uploaded_at).toLocaleString('fr-FR')}`}
            />
            <Chip
              label={formatLabels[note.original_format] || note.original_format}
              size="small"
              sx={{ mr: 1 }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
