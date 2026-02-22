import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export interface StudentNote {
  student_id: string;
  student_name: string;
  original_format: string;
  uploaded_at: string;
}

export interface MergeResult {
  student_id: string;
  added_sections: number;
  summary: string;
}

export interface Session {
  id: string;
  course_name: string;
  course_date: string;
  status: 'collecting' | 'merging' | 'done' | 'error';
  created_at: string;
  updated_at: string;
  error_message: string | null;
  notes: StudentNote[];
  results: MergeResult[];
}

export interface SessionListItem {
  id: string;
  course_name: string;
  course_date: string;
  status: string;
  notes_count: number;
  created_at: string;
}

interface SessionCreate {
  course_name: string;
  course_date: string;
}

export const sessionsApi = createApi({
  reducerPath: 'sessionsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Session', 'SessionList'],
  endpoints: (builder) => ({
    listSessions: builder.query<SessionListItem[], void>({
      query: () => '/sessions',
      providesTags: ['SessionList'],
    }),

    getSession: builder.query<Session, string>({
      query: (id) => `/sessions/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Session', id }],
    }),

    createSession: builder.mutation<Session, SessionCreate>({
      query: (body) => ({ url: '/sessions', method: 'POST', body }),
      invalidatesTags: ['SessionList'],
    }),

    uploadNote: builder.mutation<StudentNote, { sessionId: string; formData: FormData }>({
      query: ({ sessionId, formData }) => ({
        url: `/sessions/${sessionId}/notes`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: (_result, _error, { sessionId }) => [{ type: 'Session', id: sessionId }],
    }),

    deleteNote: builder.mutation<void, { sessionId: string; studentId: string }>({
      query: ({ sessionId, studentId }) => ({
        url: `/sessions/${sessionId}/notes/${studentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { sessionId }) => [{ type: 'Session', id: sessionId }],
    }),

    launchMerge: builder.mutation<void, string>({
      query: (sessionId) => ({
        url: `/sessions/${sessionId}/merge`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, sessionId) => [{ type: 'Session', id: sessionId }],
    }),
  }),
});

export const {
  useListSessionsQuery,
  useGetSessionQuery,
  useCreateSessionMutation,
  useUploadNoteMutation,
  useDeleteNoteMutation,
  useLaunchMergeMutation,
} = sessionsApi;
