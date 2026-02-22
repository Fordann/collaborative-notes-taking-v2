import { configureStore } from '@reduxjs/toolkit';
import { sessionsApi } from './sessionsApi';

export const store = configureStore({
  reducer: {
    [sessionsApi.reducerPath]: sessionsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(sessionsApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
