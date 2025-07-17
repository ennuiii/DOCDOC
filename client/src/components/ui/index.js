// Modern UI Components for Pharmadoc
// Professional, branded components that replace generic Material-UI styling

// Card Components
export { default as GradientCard } from './GradientCard';
export { default as GlassCard } from './GlassCard';
export { default as StatCard } from './StatCard';
export { default as FloatingCard, SpotlightCard, TiltCard } from './FloatingCard';
export { default as NotificationCard, ToastNotification } from './NotificationCard';

// Interactive Components
export { default as AnimatedButton } from './AnimatedButton';
export { default as LoadingSpinner, SkeletonCard, LoadingDots } from './LoadingSpinner';

// Background Effects
export { 
  BackgroundEffects, 
  AnimatedGradientBackground, 
  SpotlightBackground 
} from './BackgroundEffects';

// Usage Examples:
/*
import { 
  GradientCard, 
  AnimatedButton, 
  StatCard, 
  LoadingSpinner,
  BackgroundEffects 
} from '../components/ui';

// Gradient Card with modern styling
<GradientCard variant="primary">
  <Typography>Beautiful gradient card</Typography>
</GradientCard>

// Animated button with hover effects
<AnimatedButton 
  variant="contained" 
  animationType="gradient"
  loading={isLoading}
>
  Click me
</AnimatedButton>

// Professional stat card with interactions
<StatCard
  title="Total Users"
  value="1,234"
  icon={<PeopleIcon />}
  variant="elevated"
  trend="up"
  trendValue="+12%"
  onClick={() => navigate('/users')}
/>

// Modern loading spinner
<LoadingSpinner 
  variant="fullscreen" 
  showLogo 
  message="Loading your dashboard..." 
/>

// Background effects for pages
<BackgroundEffects variant="mixed">
  <YourPageContent />
</BackgroundEffects>
*/
