# URL Shortener

URL Shortener is a full-stack web application that converts long URLs into short, shareable links while providing authentication, analytics, caching, rate limiting, and administrative controls.  
The project is built using a production-oriented architecture.

---

## Features

### Core Functionality
- Generate short URLs for long links
- Fast redirection using server-side caching
- QR code generation for shortened URLs

### Authentication and Users
- User registration and login
- Profile management with avatar upload
- Role-based access control (Admin / User)

### Analytics
- Click tracking for each shortened URL
- User-agent and device information logging
- Timestamped access records

### Performance and Security
- Redis caching for low-latency redirection
- Rate limiting to prevent abuse
- URL blacklist
- Request logging middleware

### Administration and Utilities
- Admin dashboard
- CLI and HTTP API support
- Dockerized deployment

---

## Tech Stack

### Frontend
- React
- Axios

### Backend
- Node.js
- Express.js
- MongoDB
- Redis

### DevOps
- Docker
- Docker Compose

---
