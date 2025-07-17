import { Card, CardContent } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledGlassCard = styled(Card)(({ theme, intensity = 'medium' }) => {
  const intensityStyles = {
    light: {
      background: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
    },
    medium: {
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    heavy: {
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
  };

  return {
    borderRadius: 20,
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    ...intensityStyles[intensity],
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      width: '1px',
      bottom: 0,
      background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.8), transparent)',
    },
  };
});

const GlassCard = ({ 
  children, 
  intensity = 'medium', 
  sx = {}, 
  contentSx = {},
  ...props 
}) => {
  return (
    <StyledGlassCard intensity={intensity} sx={sx} {...props}>
      <CardContent sx={{ position: 'relative', zIndex: 1, ...contentSx }}>
        {children}
      </CardContent>
    </StyledGlassCard>
  );
};

export default GlassCard;
