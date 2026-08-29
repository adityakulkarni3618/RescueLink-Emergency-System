# RescueLink Feature Preservation Checklist

This checklist verifies that all core functionalities remain intact after implementing the bandwidth optimizations.

## Core Modules & Functional Checks

* **[x] Patient Workflow**: Patient can register, report an emergency case, and request an ambulance.
* **[x] Ambulance Dispatch**: Automated dispatch engine evaluates available units and routes routing invitations.
* **[x] Paramedic Workflow**: Drivers receive real-time request alerts and can accept or decline assignments.
* **[x] Hospital Workflow**: Doctors can view incoming ambulance ETAs, pre-register clinical slots, and prepare triage beds.
* **[x] Admin War Room**: Live Mapbox overview of all units, hospital occupancy percentages, and ongoing emergency coordinates.
* **[x] Live GPS Tracking**: Paramedics send coordinates via `location-update` to the targeted `mission_${reqId}` room.
* **[x] Live Patient Vitals**: Real-time heart rate, SpO2, and temperature charts broadcast securely to receiving doctors.
* **[x] Authentication & Security**: JWT verification, 2FA/Speakeasy TOTP, and role check middlewares operate without modification.
* **[x] Database & Cache**: PostgreSQL/Neon and Redis connection fallbacks operate normally.
* **[x] Mapbox & Directions**: Route coordinates recalculate correctly on paramedic movement and display in the patient map.
