# RescueLink Real-Time Telemetry & WebSocket Architecture

This document describes the real-time communications model of the RescueLink Emergency System, outlining the layout of namespaces, rooms, events, and data flow mechanisms optimized for low bandwidth overhead.

## 1. WebSocket Client Lifecycle
RescueLink enforces a single, centralized Socket.io client initialization within the core application layout hook inside `App.js`.
* **Scope**: A singleton connection is instantiated upon successful authentication using JWT credentials passed in the handshake.
* **Auto-Reconnection**: Active reconnection parameters are throttled to a maximum of 15 attempts with a 1-second backoff interval to prevent connection-churn loops.
* **Disconnection Cleanup**: Sockets are immediately disconnected upon logging out or switching dashboard interfaces to prevent ghost subscriptions.

## 2. Room-Based Routing & Channel Boundaries
Rather than broadcasting telemetry globally, updates are segmented into isolated channels:
* `mission_${reqId}`: Restricts live GPS location tracks, clinical vital telemetry, and messaging channels exclusively to the assigned paramedic and the authorized hospital/doctor rooms.
* `admin_warroom`: Delivers full real-time city-level fleet metrics only to administrative monitors.

## 3. Optimizations & Compression
* **Targeted Emissions**: Replaced global broadcasts of the complete fleet database (`io.emit('ambulances-update')`) during transport simulations with directed events targeted only to the administrative console (`admin_warroom`) and the active client room.
* **Aggressive Client-Side Throttling**: Pre-authentication dashboard widgets only fetch database registries once every 60 seconds (instead of the previous 8-second tight loop), significantly reducing API data usage.
