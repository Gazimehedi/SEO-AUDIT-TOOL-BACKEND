# SEO Tool Backend

Powering the high-performance SEO Audit engine with real-time crawling, AI intelligence, and professional report generation.

## 🚀 Built With

- **Framework**: Express.js (TypeScript)
- **Database**: MySQL with Prisma ORM
- **AI Intelligence**: Llama 3 via [Groq SDK](https://groq.com/)
- **Job Queue**: BullMQ & Redis
- **Real-time**: Socket.io for audit progress
- **Report Engine**: Puppeteer (PDF Generation)
- **Security**: NextAuth.js / JWT

## 🛠️ Getting Started

### Prerequisites

- Node.js 18+
- MySQL Server
- Redis (for Job Queues)
- Groq API Key (for AI insights)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (`.env`):
   ```env
   DATABASE_URL="mysql://user:password@localhost:3306/seo_tool"
   REDIS_HOST="127.0.0.1"
   REDIS_PORT=6379
   GROQ_API_KEY="your_api_key_here"
   JWT_SECRET="your_secret"
   ```

3. Database Setup:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. Start Development Server:
   ```bash
   npm run dev
   ```

## 🏗️ Architecture

- `src/api/routes`: RESTful endpoints for audits, AI, competitors, and monitoring.
- `src/queue`: Background jobs for crawling and expensive analysis.
- `src/socket`: WebSocket event handlers for real-time UI updates.
- `src/middleware`: Auth and validation logic.

## 📄 License

Proprietary — All Rights Reserved.
