import { createContext, useContext, useState, useEffect } from 'react';
import { Box, Button, Typography, Snackbar, Alert } from '@mui/material';
import { 
  Accessibility, 
  TextIncrease, 
  TextDecrease, 
  Contrast,
  VolumeUp,
} from '@mui/icons-material';

const AccessibilityContext = createContext();

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
};

const AccessibilityProvider = ({ children }) => {
  const [fontSize, setFontSize] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  // Load preferences from localStorage
  useEffect(() => {
    const savedPrefs = localStorage.getItem('accessibility-preferences');
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs);
      setFontSize(prefs.fontSize || 1);
      setHighContrast(prefs.highContrast || false);
      setReducedMotion(prefs.reducedMotion || false);
      setScreenReader(prefs.screenReader || false);
    }

    // Detect if user prefers reduced motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    
    mediaQuery.addEventListener('change', (e) => {
      setReducedMotion(e.matches);
    });

    return () => mediaQuery.removeEventListener('change', () => {});
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    const prefs = {
      fontSize,
      highContrast,
      reducedMotion,
      screenReader,
    };
    localStorage.setItem('accessibility-preferences', JSON.stringify(prefs));
  }, [fontSize, highContrast, reducedMotion, screenReader]);

  // Apply font size changes
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}rem`;
  }, [fontSize]);

  // Apply high contrast mode
  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  // Apply reduced motion
  useEffect(() => {
    if (reducedMotion) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }
  }, [reducedMotion]);

  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 0.1, 1.5));
    announce('Font size increased');
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 0.1, 0.8));
    announce('Font size decreased');
  };

  const resetFontSize = () => {
    setFontSize(1);
    announce('Font size reset to default');
  };

  const toggleHighContrast = () => {
    setHighContrast(prev => !prev);
    announce(highContrast ? 'High contrast disabled' : 'High contrast enabled');
  };

  const toggleReducedMotion = () => {
    setReducedMotion(prev => !prev);
    announce(reducedMotion ? 'Animations enabled' : 'Animations reduced');
  };

  const announce = (message) => {
    const id = Date.now();
    setAnnouncements(prev => [...prev, { id, message }]);
    
    // Remove announcement after 3 seconds
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    }, 3000);
  };

  const value = {
    fontSize,
    highContrast,
    reducedMotion,
    screenReader,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    toggleHighContrast,
    toggleReducedMotion,
    announce,
    showPanel,
    setShowPanel,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      
      {/* Accessibility Panel */}
      {showPanel && (
        <Box
          sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            width: 300,
            backgroundColor: 'background.paper',
            border: '2px solid',
            borderColor: 'primary.main',
            borderRadius: 2,
            p: 2,
            zIndex: 9999,
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
          }}
          role="dialog"
          aria-labelledby="accessibility-panel-title"
        >
          <Typography id="accessibility-panel-title" variant="h6" gutterBottom>
            Accessibility Options
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Font Size Controls */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Font Size
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  size="small"
                  onClick={decreaseFontSize}
                  disabled={fontSize <= 0.8}
                  aria-label="Decrease font size"
                >
                  <TextDecrease />
                </Button>
                <Typography variant="body2" sx={{ minWidth: 60, textAlign: 'center' }}>
                  {Math.round(fontSize * 100)}%
                </Typography>
                <Button
                  size="small"
                  onClick={increaseFontSize}
                  disabled={fontSize >= 1.5}
                  aria-label="Increase font size"
                >
                  <TextIncrease />
                </Button>
                <Button size="small" onClick={resetFontSize}>
                  Reset
                </Button>
              </Box>
            </Box>

            {/* High Contrast Toggle */}
            <Box>
              <Button
                fullWidth
                variant={highContrast ? 'contained' : 'outlined'}
                onClick={toggleHighContrast}
                startIcon={<Contrast />}
                aria-pressed={highContrast}
              >
                High Contrast
              </Button>
            </Box>

            {/* Reduced Motion Toggle */}
            <Box>
              <Button
                fullWidth
                variant={reducedMotion ? 'contained' : 'outlined'}
                onClick={toggleReducedMotion}
                aria-pressed={reducedMotion}
              >
                Reduce Motion
              </Button>
            </Box>

            <Button
              onClick={() => setShowPanel(false)}
              variant="text"
              size="small"
            >
              Close
            </Button>
          </Box>
        </Box>
      )}

      {/* Screen Reader Announcements */}
      <Box
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          left: -10000,
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        {announcements.map(announcement => (
          <div key={announcement.id}>{announcement.message}</div>
        ))}
      </Box>

      {/* Skip Links */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          top: -40,
          left: 6,
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          padding: 1,
          textDecoration: 'none',
          borderRadius: 1,
          zIndex: 10000,
          transition: 'top 0.3s',
          '&:focus': {
            top: 6,
          },
        }}
      >
        Skip to main content
      </Box>
    </AccessibilityContext.Provider>
  );
};

// Accessibility Toolbar Component
export const AccessibilityToolbar = () => {
  const { setShowPanel } = useAccessibility();

  return (
    <Button
      onClick={() => setShowPanel(true)}
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        minWidth: 56,
        height: 56,
        borderRadius: '50%',
        backgroundColor: 'primary.main',
        color: 'primary.contrastText',
        zIndex: 1000,
        '&:hover': {
          backgroundColor: 'primary.dark',
        },
      }}
      aria-label="Open accessibility options"
    >
      <Accessibility />
    </Button>
  );
};

export default AccessibilityProvider;
