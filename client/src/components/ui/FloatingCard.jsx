import { Card, CardContent, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useState } from 'react';

const StyledFloatingCard = styled(Card)(({ theme, floating = true }) => ({
  borderRadius: 20,
  border: '1px solid #e2e8f0',
  background: 'white',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'pointer',
  ...(floating && {
    '&:hover': {
      transform: 'translateY(-8px) scale(1.02)',
      boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      '&::before': {
        opacity: 1,
      },
      '& .floating-card-content': {
        transform: 'translateY(-2px)',
      },
      '& .floating-card-glow': {
        opacity: 0.6,
        transform: 'scale(1.1)',
      },
    },
  }),
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, #2563eb, #7c3aed, #2563eb)',
    opacity: 0,
    transition: 'opacity 0.4s ease',
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    top: -50,
    left: -50,
    width: 100,
    height: 100,
    background: 'radial-gradient(circle, rgba(37, 99, 235, 0.1) 0%, transparent 70%)',
    borderRadius: '50%',
    opacity: 0,
    transition: 'all 0.4s ease',
    pointerEvents: 'none',
  },
}));

const GlowEffect = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '200%',
  height: '200%',
  background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, transparent 70%)',
  transform: 'translate(-50%, -50%)',
  opacity: 0,
  transition: 'all 0.6s ease',
  pointerEvents: 'none',
  zIndex: 0,
}));

const FloatingCard = ({
  children,
  floating = true,
  glowEffect = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  sx = {},
  contentSx = {},
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = (e) => {
    setIsHovered(true);
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e) => {
    setIsHovered(false);
    onMouseLeave?.(e);
  };

  return (
    <StyledFloatingCard
      floating={floating}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={sx}
      {...props}
    >
      {glowEffect && (
        <GlowEffect 
          className="floating-card-glow"
          sx={{
            opacity: isHovered ? 0.6 : 0,
            transform: isHovered ? 'translate(-50%, -50%) scale(1.1)' : 'translate(-50%, -50%)',
          }}
        />
      )}
      
      <CardContent 
        className="floating-card-content"
        sx={{ 
          position: 'relative', 
          zIndex: 1,
          transition: 'transform 0.4s ease',
          ...contentSx,
        }}
      >
        {children}
      </CardContent>
    </StyledFloatingCard>
  );
};

// Spotlight Card variant
export const SpotlightCard = ({ 
  children, 
  spotlightColor = '#2563eb',
  sx = {},
  ...props 
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <Card
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        borderRadius: 3,
        border: '1px solid #e2e8f0',
        background: 'white',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        },
        ...sx,
      }}
      {...props}
    >
      {/* Spotlight effect */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(circle 150px at ${mousePosition.x}px ${mousePosition.y}px, ${spotlightColor}15, transparent)`,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      
      <CardContent sx={{ position: 'relative', zIndex: 2 }}>
        {children}
      </CardContent>
    </Card>
  );
};

// Tilt Card variant
export const TiltCard = ({ 
  children, 
  tiltIntensity = 10,
  sx = {},
  ...props 
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const tiltX = (e.clientY - centerY) / (rect.height / 2) * tiltIntensity;
    const tiltY = (e.clientX - centerX) / (rect.width / 2) * -tiltIntensity;
    
    setTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <Card
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      sx={{
        borderRadius: 3,
        border: '1px solid #e2e8f0',
        background: 'white',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transformStyle: 'preserve-3d',
        '&:hover': {
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        },
        ...sx,
      }}
      {...props}
    >
      <CardContent sx={{ transform: 'translateZ(50px)' }}>
        {children}
      </CardContent>
    </Card>
  );
};

export default FloatingCard;
