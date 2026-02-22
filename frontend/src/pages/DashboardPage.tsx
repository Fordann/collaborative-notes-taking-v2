import { Box, Typography, Button, Grid, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { useListSessionsQuery } from '../api/sessionsApi';
import SessionCard from '../components/SessionCard';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: sessions, isLoading, error } = useListSessionsQuery();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Sessions de cours
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/sessions/new')}
        >
          Nouvelle session
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Typography color="error" textAlign="center">
          Erreur lors du chargement des sessions
        </Typography>
      )}

      {sessions && sessions.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Aucune session pour le moment
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Créez une session pour commencer à fusionner des notes de cours.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => navigate('/sessions/new')}
          >
            Créer ma première session
          </Button>
        </Box>
      )}

      {sessions && sessions.length > 0 && (
        <Grid container spacing={2}>
          {sessions.map((session) => (
            <Grid item xs={12} sm={6} md={4} key={session.id}>
              <SessionCard session={session} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
