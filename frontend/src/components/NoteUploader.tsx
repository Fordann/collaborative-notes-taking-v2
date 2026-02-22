import { useState, useCallback } from 'react';
import { Box, TextField, Button, Typography, Paper } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useDropzone } from 'react-dropzone';
import { useUploadNoteMutation } from '../api/sessionsApi';
import { useUIStore } from '../stores/uiStore';

const ACCEPTED_EXTENSIONS = ['.docx', '.md', '.txt', '.odt'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

interface NoteUploaderProps {
  sessionId: string;
}

export default function NoteUploader({ sessionId }: NoteUploaderProps) {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadNote, { isLoading }] = useUploadNoteMutation();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        showSnackbar('Formats acceptés : .docx, .md, .txt, .odt', 'error');
        return;
      }
      if (f.size > MAX_SIZE) {
        showSnackbar('Fichier trop volumineux (max 10 Mo)', 'error');
        return;
      }
      setFile(f);
    }
  }, [showSnackbar]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
  });

  const handleSubmit = async () => {
    if (!file || !studentId.trim() || !studentName.trim()) {
      showSnackbar('Veuillez remplir tous les champs et sélectionner un fichier', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('student_id', studentId.trim());
    formData.append('student_name', studentName.trim());

    try {
      await uploadNote({ sessionId, formData }).unwrap();
      showSnackbar('Notes uploadées avec succès', 'success');
      setStudentId('');
      setStudentName('');
      setFile(null);
    } catch (err: any) {
      const message = err?.data?.detail || 'Erreur lors de l\'upload';
      showSnackbar(message, 'error');
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Uploader des notes
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="ID Étudiant"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label="Nom de l'étudiant"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          size="small"
          fullWidth
        />
      </Box>

      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.400',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? 'action.hover' : 'transparent',
          mb: 2,
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
        {file ? (
          <Typography>{file.name} ({(file.size / 1024).toFixed(1)} Ko)</Typography>
        ) : (
          <Typography color="text.secondary">
            {isDragActive
              ? 'Déposez le fichier ici...'
              : 'Glissez-déposez un fichier ici, ou cliquez pour sélectionner'}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Formats acceptés : .docx, .md, .txt, .odt (max 10 Mo)
        </Typography>
      </Box>

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={isLoading || !file || !studentId.trim() || !studentName.trim()}
        fullWidth
      >
        {isLoading ? 'Upload en cours...' : 'Uploader'}
      </Button>
    </Paper>
  );
}
