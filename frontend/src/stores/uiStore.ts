import { create } from 'zustand';

interface UIState {
  snackbar: { open: boolean; message: string; severity: 'success' | 'error' | 'info' };
  showSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void;
  closeSnackbar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  snackbar: { open: false, message: '', severity: 'info' },
  showSnackbar: (message, severity = 'info') =>
    set({ snackbar: { open: true, message, severity } }),
  closeSnackbar: () =>
    set((state) => ({ snackbar: { ...state.snackbar, open: false } })),
}));
