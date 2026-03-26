# Backend Deployment Guide (SEO Tool)

> **Pro-Tip**: If you see an "Internal Server Error" on your URL, create a `.htaccess` file in your `public_html/` folder with this content to proxy traffic to the backend:
> ```apache
> DirectoryIndex disabled
> RewriteEngine On
> RewriteRule ^$ http://127.0.0.1:5000/ [P,L]
> RewriteRule ^(.*)$ http://127.0.0.1:5000/$1 [P,L]
> ```

The backend is a Node.js Express application that requires a MySQL database and a Redis instance for its queue-based audit engine.

## Environment Variables (.env)
Create a `.env` file in this directory with the following variables:

```bash
PORT=5000
NODE_ENV="production"
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DB_NAME"
REDIS_URL="redis://HOST:6379"
FRONTEND_URL="https://your-frontend-domain.com"
GROQ_API_KEY="your_api_key_for_ai"
JWT_SECRET="a_secure_random_string"
```

## Deployment Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Database**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```

4. **Install PM2 & Run**:
   If `pm2` is not installed, install it globally:
   ```bash
   npm install -g pm2
   ```
   
   Start the backend:
   ```bash
   npx pm2 start ecosystem.config.js
   npx pm2 save
   ```
   *Note: If `pm2` command still fails after installation, use `npx pm2` to bypass PATH issues.*

## Requirements
* **Node.js**: 18.x or higher
* **MySQL**: 8.x
* **Redis**: 6.x or higher
