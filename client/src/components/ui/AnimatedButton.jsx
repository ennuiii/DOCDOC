import { Button, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useState } from 'react';

const StyledAnimatedButton = styled(Button)(({ theme, variant = 'contained', animationType = 'default' }) => {
  const baseStyles = {
    borderRadius: 12,
    textTransform: 'none',
    fontWeight: 500,
    padding: '12px 24px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
      transition: 'left 0.5s',
    },
    '&:hover:before': {
      left: '100%',
    },
  };

  const animationStyles = {
    default: {
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
      '&:active': {
        transform: 'translateY(0)',
      },
    },
    scale: {
      '&:hover': {
        transform: 'scale(1.05)',
      },
      '&:active': {
        transform: 'scale(0.98)',
      },
    },
    glow: {
      '&:hover': {
        boxShadow: `0 0 20px ${theme.palette.primary.main}40`,
        transform: 'translateY(-1px)',
      },
    },
    gradient: {
      background: variant === 'contained' 
        ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
        : 'transparent',
      '&:hover': {
        background: variant === 'contained'
          ? 'linear-gradient(135deg, #1d4ed8 0%, #5b21b6 100%)'
          : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        color: 'white',
        transform: 'translateY(-2px)',
      },
    },
  };

  return {
    ...baseStyles,
    ...animationStyles[animationType],
  };
});

const AnimatedButton = ({ 
  children, 
  loading = false, 
  animationType = 'default',
  loadingText = 'Loading...',
  onClick,
  disabled,
  ...props 
}) => {
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = async (e) => {
    if (loading || disabled) return;
    
    setIsClicked(true);
    
    // Add a small delay for visual feedback
    setTimeout(() => setIsClicked(false), 200);
    
    if (onClick) {
      await onClick(e);
    }
  };

  return (
    <StyledAnimatedButton
      {...props}
      animationType={animationType}
      onClick={handleClick}
      disabled={loading || disabled}
      sx={{
        ...(isClicked && {
          transform: 'scale(0.98)',
        }),
        ...props.sx,
      }}
    >
      {loading ? (
        <>
          <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
          {loadingText}
        </>
      ) : (
        children
      )}
    </StyledAnimatedButton>
  );
};

export default AnimatedButton;
