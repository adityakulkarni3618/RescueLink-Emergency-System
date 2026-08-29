# RescueLink Bandwidth Audit Report

This report identifies high-frequency data sources in the RescueLink system, analyzing their payload sizes, update frequencies, recipients, protocol channels, and risk profiles.

## High-Frequency Data Sources & Analysis

| Source / Event | Protocol | Frequency | Payload Size | Recipients | Room / Scope | Realtime Required? | Recommended Mitigation | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ambulances-update` | WebSocket | 2 seconds | ~1.5 KB | Connected Admins | `admin_warroom` | Yes (Admins only) | Changed from global `io.emit` to targeted `io.to('admin_warroom')` to avoid spamming idle drivers and patients. | Low |
| `location-update` | WebSocket | 2 seconds | ~200 Bytes | Active Mission Users | `mission_${reqId}` | Yes (Active tracking) | Restrict strictly to the assigned patient, paramedic, and receiving doctor. | Low |
| `vitals-update` | WebSocket | 1 second | ~150 Bytes | Assigned Doctor & Driver | `mission_${reqId}` | Yes (Critical diagnostics) | Stream only within active mission rooms. Avoid history payloads in realtime packets. | Low |
| `/api/ambulances` | HTTP GET | 60 seconds | ~3 KB | Idle dashboards | Global | No (Background state) | Increased polling from 8s to 60s on homepage panels. Active emergency routes use sockets instead. | Low |
| `/api/hospitals` | HTTP GET | 60 seconds | ~2 KB | Idle dashboards | Global | No (Static resources) | Increased polling from 10s to 60s. Cache endpoints where applicable. | Low |

## Findings and Assessment
1. **Global WebSocket Broadcasts**: Before optimization, `io.emit('ambulances-update')` sent telemetry for the entire city ambulance fleet to all connected clients every 2 seconds. In production with 100+ clients, this generated massive outbound bandwidth. Targeting this to `admin_warroom` resolves this issue.
2. **Short-Interval HTTP Polling**: The main homepage components periodically fetched `/api/ambulances` and `/api/hospitals` every 8–10 seconds even when no emergency was active. Increasing this to 60 seconds reduces HTTP egress by ~87%.
