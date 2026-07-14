# RescueLink Production Deployment Guide

This guide details instructions to deploy the RescueLink real-time emergency system on public cloud platforms and secure empanelled private clouds (e.g. AWS/Azure India or local state datacenters for government pilot projects).

---

## 1. Third-Party & Paid Dependencies

Before deploying to production, verify you have credentials/keys for the following paid integrations:
- **Google Maps Platform**: Directions API, Distance Matrix API, and Roads API (for Green Corridor route calculations and live traffic-aware suggestions).
- **Twilio API**: Required for automated WhatsApp alerts and fallback SMS notifications to hospitals and families.
- **Daily.co WebRTC**: Required for the direct telemedicine remote specialist audio/video call panels.
- **Razorpay**: Required for direct payment capturing and ambulance booking transactions.
- **Sentry DSN**: Required for real-time error tracking and performance profiling.

---

## 2. Option A: DigitalOcean Droplet Staging Deploy (Recommended)

To deploy the production-ready staging environment:

### Step 1: VM Provisioning & Firewall Configuration
1. Spin up a DigitalOcean Droplet using the **Docker on Ubuntu** image (minimum 2GB RAM / 1 vCPU tier).
2. Configure DNS: Point your staging subdomain A record (e.g., `staging.rescuelink.in`) to the Droplet's public IP address.
3. Allow ports: Open TCP traffic on ports 80 and 443 on the Droplet's firewall:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow ssh
   sudo ufw enable
   ```

### Step 2: Environment Configuration (.env)
1. Generate the environment file `.env` on your Droplet. **Never commit this file to git.**
2. Secure the file permissions so it is not world-readable:
   ```bash
   chmod 600 .env
   ```
3. Set your production connections, ensuring `DB_HOST` maps to a managed PostgreSQL cluster (verify automated backups are enabled in the database dashboard panel). Explicitly declare `PRODUCTION_URL` and `FRONTEND_URL` to define allowed origins for CORS. Server will refuse to boot in production if they are missing.

### Step 3: Run Database Migrations
1. Before starting the web containers, spin up a transient container to run migrations and seed the database schema:
   ```bash
   docker-compose -f docker-compose.prod.yml run --rm server node scripts/run-migrations.js
   ```

### Step 4: Start Services & Obtain SSL Certificate
1. Run Certbot to generate Let's Encrypt certificates:
   ```bash
   sudo certbot certonly --standalone -d staging.yourdomain.com
   ```
2. Start the application services:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build
   ```

### Step 5: Verification Checklist on Staging
- Verify `/health` and `/ready` return operational statistics.
- Verify Socket.io connection handshake works. Open an ambulance window and a hospital window against the staging URL, start a vitals stream, and verify values update in real-time without proxy timeouts.
- Verify JWT rate-limiting and MFA tokens are blocked on protected routes.
- Verify a raw `SELECT * FROM patients` on your managed PostgreSQL database displays encrypted hashes, not plaintext names.

---

## 3. Option B: Government Pilot (CERT-In Empanelled Cloud)

For official state pilots or empanelled cloud datacenters (e.g., NIC, CtrlS, AWS India MeitY-compliant zones):

### 1. Database and Cache Hardening
- Deploy MeitY-compliant managed databases: Use **AWS RDS PostgreSQL** (Multi-AZ) and **ElastiCache Redis** configured with Encryption-in-Transit (TLS) and at rest.
- Restrict security groups so only the application server container instances can access the DB ports (5432 and 6379).

### 2. Deployment via Docker Compose Prod
1. Clone the repository on the target VM node.
2. Configure `/etc/environment` or a local secure `.env` file with production credentials.
3. Start the production containers:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build
   ```

### 3. Nginx and SSL Certificates (TLS Termination)
- Configure Nginx inside `docker-compose.prod.yml` to terminate SSL by mapping Certbot directories:
  ```bash
  sudo apt-get install certbot
  sudo certbot certonly --standalone -d yourdomain.gov.in
  ```
- Certbot outputs will map automatically to Nginx's certificate paths defined inside `nginx.conf`.
- Configure HSTS (Strict-Transport-Security) headers to enforce HTTPS access exclusively.
