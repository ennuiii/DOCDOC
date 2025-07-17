import { Card, CardContent, Typography, Avatar, Box, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TrendingUp, TrendingDown, MoreVert } from '@mui/icons-material';

const StyledStatCard = styled(Card)(({ theme, variant = 'default' }) => {
  const variants = {
    default: {
      background: 'white',
      border: '1px solid #e2e8f0',
    },
    gradient: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      border: 'none',
    },
    glass: {
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    elevated: {
      background: 'white',
      border: 'none',
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    },
  };

  return {
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    ...variants[variant],
    '&:hover': {
      transform: 'translateY(-4px) scale(1.02)',
      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.15)',
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      background: variant === 'gradient' 
        ? 'rgba(255,255,255,0.3)' 
        : 'linear-gradient(90deg, #2563eb, #7c3aed)',
    },
  };
});

const StatCard = ({
  title,
  value,
  icon,
  trend,
  trendValue,
  subtitle,
  variant = 'default',
  color = 'primary',
  onClick,
  showMenu = false,
  onMenuClick,
  sx = {},
  ...props
}) => {
  const getTrendIcon = () => {
    if (!trend) return null;
    return trend === 'up' ? <TrendingUp /> : <TrendingDown />;
  };

  const getTrendColor = () => {
    if (!trend) return 'text.secondary';
    return trend === 'up' ? 'success.main' : 'error.main';
  };

  const getIconColor = () => {
    if (variant === 'gradient') return 'rgba(255,255,255,0.9)';
    return `${color}.main`;
  };

  return (
    <StyledStatCard 
      variant={variant} 
      onClick={onClick}
      sx={sx}
      {...props}
    >
      <CardContent sx={{ p: 3, position: 'relative' }}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
          <Box>
            <Typography 
              variant="body2" 
              color={variant === 'gradient' ? 'rgba(255,255,255,0.8)' : 'text.secondary'}
              gutterBottom
              sx={{ fontWeight: 500 }}
            >
              {title}
            </Typography>
            <Typography 
              variant="h4" 
              component="div"
              sx={{ 
                fontWeight: 700,
                color: variant === 'gradient' ? 'white' : 'text.primary',
                mb: 1
              }}
            >
              {value}
            </Typography>
            {subtitle && (
              <Typography 
                variant="body2" 
                color={variant === 'gradient' ? 'rgba(255,255,255,0.7)' : 'text.secondary'}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          
          <Box display="flex" flexDirection="column" alignItems="flex-end">
            <Avatar 
              sx={{ 
                bgcolor: getIconColor(),
                width: 48, 
                height: 48,
                mb: 1,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            >
              {icon}
            </Avatar>
            {showMenu && (
              <IconButton 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuClick?.(e);
                }}
                sx={{ 
                  color: variant === 'gradient' ? 'rgba(255,255,255,0.7)' : 'text.secondary',
                  '&:hover': {
                    bgcolor: variant === 'gradient' ? 'rgba(255,255,255,0.1)' : 'action.hover',
                  }
                }}
              >
                <MoreVert />
              </IconButton>
            )}
          </Box>
        </Box>

        {(trend || trendValue) && (
          <Box display="flex" alignItems="center" gap={1}>
            {getTrendIcon() && (
              <Box 
                display="flex" 
                alignItems="center" 
                sx={{ color: getTrendColor() }}
              >
                {getTrendIcon()}
              </Box>
            )}
            {trendValue && (
              <Typography 
                variant="body2" 
                sx={{ 
                  color: getTrendColor(),
                  fontWeight: 500 
                }}
              >
                {trendValue}
              </Typography>
            )}
          </Box>
        )}

        {/* Decorative elements for gradient variant */}
        {variant === 'gradient' && (
          <>
            <Box
              sx={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                zIndex: 0,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -30,
                left: -30,
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                zIndex: 0,
              }}
            />
          </>
        )}
      </CardContent>
    </StyledStatCard>
  );
};

export default StatCard;
