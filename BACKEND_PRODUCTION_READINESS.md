# RescueLink Backend Production-Readiness Runbook

This document details the configuration requirements, scaling structures, and deployment protocols for running the RescueLink backend in a long-term production environment.

## 1. Environment Configurations

Below are the variables required inside `.env` to configure services dynamically:
* `PORT`: Dynamically assigned cloud listener port (e.g. `8080`, fallback: `5000`).
* `NODE_ENV`: Set to `production` to activate SSL bindings and disable debug details.
* `DATABASE_URL`: Authority URL for Neon/Postgres Dialects.
* `REDIS_URL`: Endpoint of the Redis cache clusters.
* `JWT_SECRET`: Signing token key (min. 32 characters).
* `FRONTEND_URL` / `PRODUCTION_URL`: CORS-authorized frontend domains.

## 2. Ports and Host Bindings
* The backend respects the `process.env.PORT` variable dynamically provided by cloud hosts (Railway, Koyeb, Render).
* The socket and REST server binds automatically to interface `0.0.0.0` ensuring cloud routing compatibility.

## 3. Database & Redis Failover
* **Sequelize Pools**: Default settings maintain a pool size of up to 20 database connections with automatic reconnection handlers.
* **Redis Falling Back**: Cache blacklists and lock synchronization adapters falling back automatically to local in-memory dictionaries if the Redis instance dropouts, preventing application crash-loops.

## 4. central Health Indicators
Exposes endpoints on the root route to satisfy load balancer watchdog checks:
* `GET /health`: Lightweight endpoint returning `{ "status": "ok" }`.
* `GET /ready`: Readiness check verifying live database and redis connection checks.

## 5. Graceful Shutdown (SIGTERM/SIGINT)
Upon receipt of system shutdown alerts, the application executes the following:
1. Closes Express HTTP listeners, rejecting new incoming REST connections.
2. Closes Socket.IO server, disconnecting active clients.
3. Shuts down active Redis pools gracefully.
4. Closes active Sequelize database connection pools, executing clean process exits.
