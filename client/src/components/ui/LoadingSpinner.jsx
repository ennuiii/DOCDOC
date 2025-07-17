import { Box, CircularProgress, Typography } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';

const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.7;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

const float = keyframes`
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
`;

const StyledLoadingContainer = styled(Box)(({ theme, variant = 'default' }) => {
  const variants = {
    default: {
      minHeight: '200px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing(2),
    },
    fullscreen: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(248, 250, 252, 0.9)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      gap: theme.spacing(3),
    },
    inline: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(2),
    },
    card: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(4),
      backgroundColor: 'white',
      borderRadius: theme.spacing(2),
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      gap: theme.spacing(2),
    },
  };

  return variants[variant];
});

const StyledSpinner = styled(CircularProgress)(({ theme, color = 'primary' }) => ({
  animation: `${pulse} 2s ease-in-out infinite`,
  '& .MuiCircularProgress-circle': {
    strokeLinecap: 'round',
  },
}));

const StyledLogo = styled(Box)(({ theme }) => ({
  fontSize: '2rem',
  fontWeight: 700,
  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  animation: `${float} 3s ease-in-out infinite`,
  marginBottom: theme.spacing(1),
}));

const LoadingSpinner = ({
  variant = 'default',
  size = 40,
  color = 'primary',
  message = 'Loading...',
  showLogo = false,
  sx = {},
  ...props
}) => {
  return (
    <StyledLoadingContainer variant={variant} sx={sx} {...props}>
      {showLogo && variant === 'fullscreen' && (
        <StyledLogo>
          Pharmadoc
        </StyledLogo>
      )}
      
      <StyledSpinner 
        size={size} 
        color={color}
        thickness={4}
      />
      
      {message && (
        <Typography 
          variant={variant === 'inline' ? 'body2' : 'body1'} 
          color="text.secondary"
          sx={{ 
            fontWeight: 500,
            textAlign: 'center',
            animation: variant === 'fullscreen' ? `${pulse} 2s ease-in-out infinite` : 'none',
          }}
        >
          {message}
        </Typography>
      )}
    </StyledLoadingContainer>
  );
};

// Skeleton loading component for cards
export const SkeletonCard = ({ height = 200, sx = {} }) => (
  <Box
    sx={{
      height,
      backgroundColor: '#f1f5f9',
      borderRadius: 2,
      position: 'relative',
      overflow: 'hidden',
      ...sx,
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
        animation: 'shimmer 1.5s infinite',
        '@keyframes shimmer': {
          '0%': { left: '-100%' },
          '100%': { left: '100%' },
        },
      }}
    />
  </Box>
);

// Loading dots component
export const LoadingDots = ({ size = 8, color = '#2563eb', sx = {} }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      ...sx,
    }}
  >
    {[0, 1, 2].map((index) => (
      <Box
        key={index}
        sx={{
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: '50%',
          animation: `bounce 1.4s ease-in-out infinite both`,
          animationDelay: `${index * 0.16}s`,
          '@keyframes bounce': {
            '0%, 80%, 100%': {
              transform: 'scale(0)',
            },
            '40%': {
              transform: 'scale(1)',
            },
          },
        }}
      />
    ))}
  </Box>
);

export default LoadingSpinner;
