import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { QueryClient, QueryClientProvider } from 'react-query';
import { SnackbarProvider } from 'notistack';

import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Appointments from './pages/Appointments';
import Timeslots from './pages/Timeslots';
import Research from './pages/Research';
import NotFound from './pages/NotFound';

// Create theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  // Global query invalidation listener for real-time updates
  useEffect(() => {
    const handleQueryInvalidation = (event) => {
      const { queryKey } = event.detail;
      console.log('🔄 Invalidating query:', queryKey);
      
      if (Array.isArray(queryKey)) {
        queryClient.invalidateQueries(queryKey);
      } else {
        queryClient.invalidateQueries(queryKey);
      }
    };

    // Listen for invalidation events from real-time subscriptions
    window.addEventListener('invalidateQuery', handleQueryInvalidation);

    return () => {
      window.removeEventListener('invalidateQuery', handleQueryInvalidation);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <SnackbarProvider 
            maxSnack={3}
            autoHideDuration={2000}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <CssBaseline />
            <AuthProvider>
              <Router>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  
                  {/* Protected routes with Layout */}
                  <Route path="/dashboard" element={
                    <PrivateRoute>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </PrivateRoute>
                  } />
                  <Route path="/profile" element={
                    <PrivateRoute>
                      <Layout>
                        <Profile />
                      </Layout>
                    </PrivateRoute>
                  } />
                  <Route path="/appointments" element={
                    <PrivateRoute>
                      <Layout>
                        <Appointments />
                      </Layout>
                    </PrivateRoute>
                  } />
                  <Route path="/timeslots" element={
                    <PrivateRoute>
                      <Layout>
                        <Timeslots />
                      </Layout>
                    </PrivateRoute>
                  } />
                  <Route path="/research" element={
                    <PrivateRoute>
                      <Layout>
                        <Research />
                      </Layout>
                    </PrivateRoute>
                  } />
                  <Route path="*" element={
                    <PrivateRoute>
                      <Layout>
                        <NotFound />
                      </Layout>
                    </PrivateRoute>
                  } />
                </Routes>
              </Router>
            </AuthProvider>
          </SnackbarProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App; 