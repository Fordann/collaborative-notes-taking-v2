import { Box, LinearProgress, Typography, Paper } from '@mui/material';

export default function MergeProgress() {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Fusion en cours...
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Les notes sont en train d'être analysées et fusionnées par l'IA.
        Cette opération peut prendre quelques instants.
      </Typography>
      <LinearProgress />
    </Paper>
  );
}
