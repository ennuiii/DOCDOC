import { Box } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';

// Floating particles animation
const float = keyframes`
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
  }
  33% {
    transform: translateY(-30px) rotate(120deg);
  }
  66% {
    transform: translateY(-60px) rotate(240deg);
  }
`;

const drift = keyframes`
  0% {
    transform: translateX(0px);
  }
  100% {
    transform: translateX(100px);
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 0.4;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
`;

// Grid background
const GridBackground = styled(Box)(({ theme, spacing = 50, opacity = 0.1 }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundImage: `
    linear-gradient(rgba(37, 99, 235, ${opacity}) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 99, 235, ${opacity}) 1px, transparent 1px)
  `,
  backgroundSize: `${spacing}px ${spacing}px`,
  pointerEvents: 'none',
  zIndex: 0,
}));

// Dot background
const DotBackground = styled(Box)(({ theme, spacing = 30, size = 2, opacity = 0.2 }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundImage: `radial-gradient(circle, rgba(37, 99, 235, ${opacity}) ${size}px, transparent ${size}px)`,
  backgroundSize: `${spacing}px ${spacing}px`,
  pointerEvents: 'none',
  zIndex: 0,
}));

// Floating particles
const FloatingParticle = styled(Box)(({ theme, size = 4, delay = 0, duration = 20 }) => ({
  position: 'absolute',
  width: size,
  height: size,
  backgroundColor: 'rgba(37, 99, 235, 0.3)',
  borderRadius: '50%',
  animation: `${float} ${duration}s ease-in-out infinite ${delay}s, ${drift} ${duration * 2}s linear infinite ${delay}s`,
  pointerEvents: 'none',
}));

// Gradient orbs
const GradientOrb = styled(Box)(({ theme, size = 200, color = '#2563eb', opacity = 0.1 }) => ({
  position: 'absolute',
  width: size,
  height: size,
  borderRadius: '50%',
  background: `radial-gradient(circle, ${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
  filter: 'blur(40px)',
  animation: `${pulse} 8s ease-in-out infinite`,
  pointerEvents: 'none',
}));

// Main background effects component
export const BackgroundEffects = ({ 
  variant = 'grid',
  children,
  sx = {},
  ...props 
}) => {
  const renderBackground = () => {
    switch (variant) {
      case 'grid':
        return <GridBackground />;
      case 'dots':
        return <DotBackground />;
      case 'particles':
        return (
          <>
            {Array.from({ length: 20 }, (_, i) => (
              <FloatingParticle
                key={i}
                size={Math.random() * 6 + 2}
                delay={Math.random() * 10}
                duration={Math.random() * 10 + 15}
                sx={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </>
        );
      case 'orbs':
        return (
          <>
            <GradientOrb
              size={300}
              color="#2563eb"
              opacity={0.05}
              sx={{ top: '10%', left: '10%' }}
            />
            <GradientOrb
              size={200}
              color="#7c3aed"
              opacity={0.08}
              sx={{ top: '60%', right: '10%' }}
            />
            <GradientOrb
              size={150}
              color="#059669"
              opacity={0.06}
              sx={{ bottom: '20%', left: '30%' }}
            />
          </>
        );
      case 'mixed':
        return (
          <>
            <GridBackground spacing={60} opacity={0.05} />
            <GradientOrb
              size={400}
              color="#2563eb"
              opacity={0.03}
              sx={{ top: '20%', right: '20%' }}
            />
            <GradientOrb
              size={300}
              color="#7c3aed"
              opacity={0.04}
              sx={{ bottom: '10%', left: '10%' }}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        ...sx,
      }}
      {...props}
    >
      {renderBackground()}
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {children}
      </Box>
    </Box>
  );
};

// Animated gradient background
export const AnimatedGradientBackground = ({ 
  colors = ['#667eea', '#764ba2'],
  children,
  sx = {},
  ...props 
}) => {
  const gradientAnimation = keyframes`
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  `;

  return (
    <Box
      sx={{
        background: `linear-gradient(-45deg, ${colors.join(', ')})`,
        backgroundSize: '400% 400%',
        animation: `${gradientAnimation} 15s ease infinite`,
        position: 'relative',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

// Spotlight effect
export const SpotlightBackground = ({ 
  children,
  spotlightColor = '#2563eb',
  sx = {},
  ...props 
}) => {
  return (
    <Box
      sx={{
        position: 'relative',
        background: 'radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.1) 0%, transparent 50%)',
        ...sx,
      }}
      {...props}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${spotlightColor}20 60deg, transparent 120deg)`,
          animation: `${keyframes`
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          `} 20s linear infinite`,
          pointerEvents: 'none',
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {children}
      </Box>
    </Box>
  );
};

export default BackgroundEffects;
