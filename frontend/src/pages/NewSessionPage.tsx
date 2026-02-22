import { useState } from 'react';
import { Box, Typography, TextField, Button, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useCreateSessionMutation } from '../api/sessionsApi';
import { useUIStore } from '../stores/uiStore';

export default function NewSessionPage() {
  const navigate = useNavigate();
  const [courseName, setCourseName] = useState('');
  const [courseDate, setCourseDate] = useState('');
  const [createSession, { isLoading }] = useCreateSessionMutation();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!courseName.trim() || !courseDate) {
      showSnackbar('Veuillez remplir tous les champs', 'error');
      return;
    }

    try {
      const session = await createSession({
        course_name: courseName.trim(),
        course_date: courseDate,
      }).unwrap();
      showSnackbar('Session créée avec succès', 'success');
      navigate(`/sessions/${session.id}`);
    } catch (err: any) {
      showSnackbar(err?.data?.detail || 'Erreur lors de la création', 'error');
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Nouvelle session
      </Typography>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            label="Nom du cours"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            placeholder="Ex: Philosophie — L'existentialisme"
          />
          <TextField
            label="Date du cours"
            type="date"
            value={courseDate}
            onChange={(e) => setCourseDate(e.target.value)}
            fullWidth
            required
            sx={{ mb: 3 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate('/')}
              fullWidth
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading}
              fullWidth
            >
              {isLoading ? 'Création...' : 'Créer la session'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
