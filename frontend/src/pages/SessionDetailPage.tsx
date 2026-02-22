import { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Chip, Breadcrumbs, Link } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetSessionQuery } from '../api/sessionsApi';
import NoteUploader from '../components/NoteUploader';
import NotesList from '../components/NotesList';
import MergeButton from '../components/MergeButton';
import MergeProgress from '../components/MergeProgress';
import ResultsPanel from '../components/ResultsPanel';

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  collecting: 'primary',
  merging: 'warning',
  done: 'success',
  error: 'error',
};

const statusLabels: Record<string, string> = {
  collecting: 'Collecte en cours',
  merging: 'Fusion en cours',
  done: 'Terminé',
  error: 'Erreur',
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pollingInterval, setPollingInterval] = useState(0);

  const { data: session, isLoading, error } = useGetSessionQuery(id!, {
    pollingInterval,
  });

  // Update polling interval based on session status
  useEffect(() => {
    if (session?.status === 'merging') {
      setPollingInterval(3000);
    } else {
      setPollingInterval(0);
    }
  }, [session?.status]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !session) {
    return (
      <Typography color="error" textAlign="center" sx={{ mt: 4 }}>
        Session introuvable
      </Typography>
    );
  }

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigate('/')}
        >
          Sessions
        </Link>
        <Typography color="text.primary">{session.course_name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1">
            {session.course_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Date du cours : {new Date(session.course_date).toLocaleDateString('fr-FR')}
          </Typography>
        </Box>
        <Chip
          label={statusLabels[session.status] || session.status}
          color={statusColors[session.status] || 'default'}
        />
      </Box>

      {/* Results or error display */}
      <ResultsPanel
        sessionId={session.id}
        results={session.results}
        status={session.status}
        errorMessage={session.error_message}
      />

      {/* Merge progress */}
      {session.status === 'merging' && <MergeProgress />}

      {/* Notes list */}
      <NotesList
        sessionId={session.id}
        notes={session.notes}
        canDelete={session.status === 'collecting'}
      />

      {/* Upload form (only when collecting) */}
      {session.status === 'collecting' && (
        <>
          <NoteUploader sessionId={session.id} />
          <MergeButton
            sessionId={session.id}
            notesCount={session.notes.length}
            status={session.status}
          />
        </>
      )}
    </Box>
  );
}
