# Pharmadoc Architecture Documentation

## Overview

Pharmadoc is a modern web application that connects pharmaceutical companies with doctors, enabling efficient appointment scheduling and research sharing. The platform is built using a microservices-friendly monorepo architecture with clear separation between frontend and backend services.

## Technology Stack

### Frontend
- **React 18** - UI library for building interactive user interfaces
- **Vite** - Fast build tool and development server
- **Material-UI (MUI)** - Comprehensive React component library
- **React Router v6** - Client-side routing
- **React Query** - Server state management and caching
- **Axios** - HTTP client for API communication
- **dayjs** - Lightweight date manipulation library
- **notistack** - Notification/snackbar system
- **Recharts** - Data visualization library

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - JSON Web Tokens for authentication
- **bcrypt** - Password hashing
- **Multer** - File upload handling
- **Express Validator** - Input validation

### DevOps
- **Docker** - Containerization
- **docker-compose** - Multi-container orchestration
- **ESLint** - Code linting
- **npm workspaces** - Monorepo management

## Architecture Patterns

### 1. Monorepo Structure
```
pharmadoc/
├── client/          # React frontend application
├── server/          # Express backend API
├── docker-compose.yml
└── package.json     # Root package with workspaces
```

### 2. Backend Architecture

#### Layered Architecture
- **Routes Layer**: HTTP endpoint definitions
- **Middleware Layer**: Authentication, validation, error handling
- **Controller Layer**: Request handling and response formatting
- **Service Layer**: Business logic and external integrations
- **Model Layer**: Data models and database interactions

#### Key Design Patterns
- **MVC Pattern**: Clear separation of concerns
- **Middleware Pipeline**: Composable request processing
- **Repository Pattern**: Database abstraction through Mongoose models
- **Service Pattern**: Business logic encapsulation

### 3. Frontend Architecture

#### Component Structure
- **Pages**: Route-level components
- **Components**: Reusable UI components
- **Contexts**: Global state management (Auth)
- **Hooks**: Custom React hooks
- **Services**: API communication layer

#### State Management
- **React Query**: Server state caching and synchronization
- **Context API**: Authentication state
- **Local State**: Component-specific state with useState

## Data Models

### Core Entities

1. **User**
   - Supports multiple roles: doctor, pharma, staff, admin
   - Role-specific profile fields
   - Permission-based access control

2. **Timeslot**
   - Doctor availability management
   - Support for recurring timeslots
   - Type-based access (personal, pharma, general)

3. **Appointment**
   - Links doctors, pharma reps, and timeslots
   - Status workflow management
   - Meeting type support (in-person, virtual, phone)

4. **Research**
   - Document upload and storage
   - Sharing with access control
   - Category and tag-based organization

5. **Notification**
   - Event-driven notification system
   - Read/unread tracking
   - Priority levels

## Security Architecture

### Authentication & Authorization
- **JWT-based authentication** with access and refresh tokens
- **Role-based access control (RBAC)** at route level
- **Permission-based access control** for granular permissions
- **Secure password storage** using bcrypt

### API Security
- **CORS configuration** for cross-origin requests
- **Helmet.js** for security headers
- **Input validation** on all endpoints
- **Rate limiting** potential (future enhancement)

## API Design

### RESTful Endpoints
- Consistent naming conventions
- HTTP method semantics
- Pagination support
- Filter and search capabilities

### Example Endpoints
```
GET    /api/appointments     # List appointments
POST   /api/appointments     # Create appointment
GET    /api/appointments/:id # Get specific appointment
PUT    /api/appointments/:id # Update appointment
DELETE /api/appointments/:id # Cancel appointment
```

## File Storage

### Current Implementation
- Local file storage in `uploads/` directory
- Multer for file upload handling
- Static file serving through Express

### Future Enhancements
- Cloud storage integration (AWS S3, Google Cloud Storage)
- CDN for static asset delivery
- Image optimization pipeline

## Scalability Considerations

### Database
- Indexed queries for performance
- Aggregation pipelines for statistics
- Connection pooling

### API
- Stateless design for horizontal scaling
- Cache-friendly response structures
- Pagination for large datasets

### Frontend
- Code splitting and lazy loading
- Optimized bundle sizes
- Progressive Web App capabilities (future)

## Integration Points

### Current Integrations
1. **MongoDB Database**
   - Mongoose ODM for data modeling
   - Connection string configuration

2. **File Upload System**
   - Multer middleware
   - Local storage with static serving

### Future Integration Points
1. **Email Service**
   - SMTP or third-party service (SendGrid, AWS SES)
   - Transactional email templates

2. **Real-time Communications**
   - Socket.io for live notifications
   - WebRTC for video consultations

3. **Analytics**
   - Google Analytics or Mixpanel
   - Custom analytics dashboard

4. **Payment Processing**
   - Stripe or similar for pharma subscriptions
   - Invoice generation

5. **Calendar Integration**
   - Google Calendar sync
   - Outlook integration

## Deployment Architecture

### Current Setup
- **Render.com** deployment configuration
- Environment-based configuration
- Health check endpoints

### Production Considerations
- Load balancing
- Database replication
- Backup strategies
- Monitoring and logging

## Development Workflow

### Local Development
1. Docker Compose for service orchestration
2. Hot reloading for both frontend and backend
3. Environment variable configuration

### Code Organization
- ESM modules throughout
- Consistent file naming
- Clear separation of concerns

## Future Enhancements

### Technical Enhancements
1. **GraphQL API** - Alternative to REST
2. **Microservices** - Service decomposition
3. **Event-driven architecture** - Message queuing
4. **Caching layer** - Redis integration
5. **Search functionality** - Elasticsearch

### Feature Enhancements
1. **Video consultations**
2. **Advanced analytics dashboard**
3. **Mobile applications**
4. **AI-powered recommendations**
5. **Automated scheduling**

## Performance Optimization

### Backend
- Query optimization with proper indexing
- Caching strategies
- Connection pooling
- Compression middleware

### Frontend
- Bundle optimization
- Image lazy loading
- Service worker caching
- Virtual scrolling for large lists

## Monitoring & Observability

### Logging
- Structured logging with levels
- Request/response logging
- Error tracking

### Metrics (Future)
- API response times
- Database query performance
- User activity tracking
- System health metrics

## Conclusion

The Pharmadoc architecture is designed to be scalable, maintainable, and extensible. The clear separation of concerns, modern technology stack, and thoughtful design patterns provide a solid foundation for future growth and enhancements. 