import { Card, CardContent, Typography, Button, Chip, Box, Alert, Grid, CircularProgress } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ReplayIcon from '@mui/icons-material/Replay';
import type { MergeResult } from '../api/sessionsApi';
import { useLaunchMergeMutation } from '../api/sessionsApi';
import { useUIStore } from '../stores/uiStore';

interface ResultsPanelProps {
  sessionId: string;
  results: MergeResult[];
  status: string;
  errorMessage: string | null;
}

export default function ResultsPanel({ sessionId, results, status, errorMessage }: ResultsPanelProps) {
  const [launchMerge, { isLoading }] = useLaunchMergeMutation();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const handleRetry = async () => {
    try {
      await launchMerge(sessionId).unwrap();
      showSnackbar('Fusion relancée', 'info');
    } catch (err: any) {
      showSnackbar(err?.data?.detail || 'Erreur lors de la relance', 'error');
    }
  };

  if (status === 'error') {
    return (
      <Alert
        severity="error"
        sx={{ mb: 3 }}
        action={
          <Button
            color="inherit"
            size="small"
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <ReplayIcon />}
            onClick={handleRetry}
            disabled={isLoading}
          >
            {isLoading ? 'Relance...' : 'Réessayer'}
          </Button>
        }
      >
        <Typography variant="subtitle1" fontWeight="bold">
          Erreur lors de la fusion
        </Typography>
        <Typography variant="body2">
          {errorMessage || 'Une erreur inconnue est survenue'}
        </Typography>
      </Alert>
    );
  }

  if (status !== 'done' || results.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Résultats de la fusion
      </Typography>
      <Grid container spacing={2}>
        {results.map((result) => (
          <Grid item xs={12} sm={6} md={4} key={result.student_id}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {result.student_id}
                </Typography>
                <Chip
                  label={`${result.added_sections} ajout(s)`}
                  color="success"
                  size="small"
                  sx={{ mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                  {result.summary}
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  href={`/api/sessions/${sessionId}/results/${result.student_id}`}
                  fullWidth
                >
                  Télécharger
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
