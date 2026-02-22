import { Button, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useLaunchMergeMutation } from '../api/sessionsApi';
import { useUIStore } from '../stores/uiStore';

interface MergeButtonProps {
  sessionId: string;
  notesCount: number;
  status: string;
}

export default function MergeButton({ sessionId, notesCount, status }: MergeButtonProps) {
  const [launchMerge, { isLoading }] = useLaunchMergeMutation();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const handleMerge = async () => {
    try {
      await launchMerge(sessionId).unwrap();
      showSnackbar('Fusion lancée', 'info');
    } catch (err: any) {
      showSnackbar(err?.data?.detail || 'Erreur lors du lancement de la fusion', 'error');
    }
  };

  const disabled = notesCount < 2 || status !== 'collecting' || isLoading;

  return (
    <Button
      variant="contained"
      color="primary"
      size="large"
      startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
      onClick={handleMerge}
      disabled={disabled}
      fullWidth
      sx={{ mb: 3 }}
    >
      {isLoading ? 'Lancement...' : `Lancer la fusion (${notesCount} notes)`}
    </Button>
  );
}
