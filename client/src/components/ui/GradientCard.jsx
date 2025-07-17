import { Card, CardContent, Box } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledGradientCard = styled(Card)(({ theme, variant = 'default' }) => {
  const gradients = {
    default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    primary: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    secondary: 'linear-gradient(135deg, #059669 0%, #0891b2 100%)',
    success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    medical: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
    pharma: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
  };

  return {
    background: gradients[variant] || gradients.default,
    color: 'white',
    borderRadius: 16,
    border: 'none',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s ease-in-out',
    '&:hover': {
      transform: 'translateY(-4px) scale(1.02)',
      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)',
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
      pointerEvents: 'none',
    },
  };
});

const GradientCard = ({ 
  children, 
  variant = 'default', 
  sx = {}, 
  contentSx = {},
  ...props 
}) => {
  return (
    <StyledGradientCard variant={variant} sx={sx} {...props}>
      <CardContent sx={{ position: 'relative', zIndex: 1, ...contentSx }}>
        {children}
      </CardContent>
    </StyledGradientCard>
  );
};

export default GradientCard;
