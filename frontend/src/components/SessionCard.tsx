import { Card, CardContent, CardActionArea, Typography, Chip, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { SessionListItem } from '../api/sessionsApi';

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  collecting: 'primary',
  merging: 'warning',
  done: 'success',
  error: 'error',
};

const statusLabels: Record<string, string> = {
  collecting: 'Collecte',
  merging: 'Fusion...',
  done: 'Terminé',
  error: 'Erreur',
};

interface SessionCardProps {
  session: SessionListItem;
}

export default function SessionCard({ session }: SessionCardProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/sessions/${session.id}`)}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" component="div">
              {session.course_name}
            </Typography>
            <Chip
              label={statusLabels[session.status] || session.status}
              color={statusColors[session.status] || 'default'}
              size="small"
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Date du cours : {new Date(session.course_date).toLocaleDateString('fr-FR')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {session.notes_count} note(s) uploadée(s)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Créée le {new Date(session.created_at).toLocaleDateString('fr-FR')}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
