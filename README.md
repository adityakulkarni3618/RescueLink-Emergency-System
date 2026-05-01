#  RescueLink — Real-Time Emergency Care System
### Web Wizards 2.0 Hackathon · Healthcare Emergency Track

---

##  Architecture Overview

```
emergency-care-system/
├── server/                  ← Node.js + Express + Socket.io backend
│   ├── server.js            ← Main server with all socket events
│   ├── data/patients.json   ← Mock patient database (5 patients)
│   └── package.json
│
├── client/                  ← React.js frontend
│   ├── public/index.html
│   └── src/
│       ├── App.js           ← Role selector + socket connection
│       └── components/
│           ├── AmbulanceStreamer.js   ← Paramedic console
│           └── HospitalDashboard.js  ← Doctor command center
│
└── README.md
```

---

##  Quick Start (5 minutes)

### Step 1: Install & Start Backend
```bash
cd emergency-care-system/server
npm install
node server.js
# Server runs on http://localhost:5000
```

### Step 2: Install & Start Frontend
```bash
cd emergency-care-system/client
npm install
npm start
# React app runs on http://localhost:3000
```

### Step 3: Demo Setup (IMPORTANT for judges!)
1. Open **two browser windows** side-by-side at `http://localhost:3000`
2. **Window 1** → Click **"AMBULANCE UNIT"**
3. **Window 2** → Click **"HOSPITAL COMMAND"**
4. On the Ambulance window → Click **"▶ START STREAM"**
5. Watch vitals appear live on the Hospital dashboard!

---

## Features Implemented

| Feature | Component | Status |
|---|---|---|
| Live vitals streaming (HR, SpO2, BP, Temp, RR, Glucose) | AmbulanceStreamer | Yes |
| Real-time line graphs (hospital monitor style) | HospitalDashboard | Yes |
| Live ambulance GPS tracking on Leaflet map | HospitalDashboard | Yes |
| Route simulation (Junnar → Narayangaon) | AmbulanceStreamer | Yes |
| Critical alert (red flash + audio beep) | HospitalDashboard | Yes |
| Two-way text communication | Both | Yes |
| Quick medical directives (doctor → paramedic) | HospitalDashboard | Yes |
| Patient medical history lookup | HospitalDashboard | Yes |
| Hospital resource readiness toggles | HospitalDashboard | Yes |
| Incident notes from field | AmbulanceStreamer | Yes |
| Connection status indicators | Both | Yes |
| Dark command-center UI theme | Both | Yes |

---

## Demo Script (for judges)

### Scene 1 — Normal transit
- Show vitals streaming live (HR ~78 bpm, SpO2 ~97%)
- Show ambulance marker moving along the route on the map
- Show chat working (send a message from ambulance, see it on hospital)

### Scene 2 — Critical event (trigger manually)
In `AmbulanceStreamer.js`, temporarily change the vitals range to force critical:
```js
heartRate: Math.round(clamp(jitter(prev?.heartRate ?? 115, 3), 112, 130)),
spo2: Math.round(clamp(jitter(prev?.spo2 ?? 89, 1), 87, 91)),
```
→ Hospital screen flashes red + plays alert beep automatically!

### Scene 3 — Patient record
- On ambulance, click **PAT-001** (Rajesh Kumar — HIGH RISK cardiac patient)
- Hospital immediately shows: blood group B+, Penicillin/Aspirin allergy, CAD history
- Doctor sends quick directive: **"Do NOT give morphine – allergy"**

### Scene 4 — Resource preparation
- On hospital screen, toggle: OT Prepared ✓, Cardiologist Assigned ✓
- Explain: "Hospital is now proactively preparing before the patient arrives"

---

## Socket Events Reference

| Event | Direction | Payload |
|---|---|---|
| `vitals-update` | Amb → Server → Hospital | `{ heartRate, spo2, systolic, diastolic, temperature, respRate, glucose }` |
| `location-update` | Amb → Server → Hospital | `{ lat, lng }` |
| `patient-selected` | Amb → Server → Hospital | `"PAT-001"` |
| `critical-alert` | Server → All | `{ reasons[], vitals, timestamp }` |
| `resources-update` | Hospital ↔ Server ↔ Amb | `{ otPrepared, ventilatorReady, ... }` |
| `chat-message` | Both ↔ Server ↔ Both | `{ text, from, fromLabel }` |
| `incident-note` | Amb → Server → Hospital | `{ note, from }` |
| `roles-update` | Server → All | `{ ambulance: N, hospital: N }` |

---

## npm Dependencies

### Server
```
express, socket.io, cors
```

### Client
```
react, react-dom, react-scripts
socket.io-client      ← Real-time socket communication
recharts              ← Live vital sign charts
react-leaflet         ← Interactive ambulance tracking map
leaflet               ← Map library
lucide-react          ← Icons
```

---

## Scalability & Future Scope

- **IoT Integration**: Replace simulated vitals with real medical sensors (BLE/WiFi)
- **WebRTC Video**: Add video call between paramedic and doctor
- **Multi-Ambulance**: Dashboard can track multiple ambulances simultaneously
- **AI Triage**: ML model to predict severity from vital trends
- **EHR Integration**: Connect to hospital's actual patient database (HL7/FHIR)
- **NHM API**: Integrate with National Health Mission's emergency response systems

---

*Built for Web Wizards 2.0 Hackathon — Healthcare Emergency Track*
*Team: [Your Team Name] · Maharashtra, India*
