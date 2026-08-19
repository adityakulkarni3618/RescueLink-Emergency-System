// server/utils/auditLogger.js
// Enterprise HIPAA-Compliant Audit Trail System

const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../data/audit_log.txt');

// Ensure the data directory exists
if (!fs.existsSync(path.dirname(logFilePath))) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
}

/**
 * Enterprise HIPAA-compliant audit logger.
 * Writes to PostgreSQL AuditLog table and appends to a secure local file.
 */
async function logAudit(eventCategory, action, details = {}, severity = 'INFO', userId = null, ipAddress = null) {
    const timestamp = new Date().toISOString();
    
    // Write to local append-only log file first for immutability
    const logEntry = `[${timestamp}] [${eventCategory.toUpperCase()}] [${severity}] ${action} | User: ${userId || 'SYSTEM'} | IP: ${ipAddress || 'N/A'} | Details: ${JSON.stringify(details)}\n`;
    
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error('[AUDIT ERROR] Failed to write to audit log file:', err);
    });
    
    // Print to console for dev visibility
    console.log(`\x1b[36m[AUDIT]\x1b[0m ${action} [Category: ${eventCategory}] [Severity: ${severity}]`);

    // Insert into PostgreSQL database AuditLog table
    try {
        const { AuditLog } = require('./db');
        if (AuditLog) {
            // Check if this action triggers high-severity alerts
            const isHighSeverityAction = ['PATIENT_UNMASK', 'BULK_EXPORT', 'ROLE_CHANGE', 'MFA_DISABLED'].includes(action) || severity === 'CRITICAL';
            const finalSeverity = isHighSeverityAction ? 'CRITICAL' : severity;

            // Fetch the last audit log to get its hash
            let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
            try {
                const lastLog = await AuditLog.findOne({
                    order: [['createdAt', 'DESC']]
                });
                if (lastLog && lastLog.details && lastLog.details.hash) {
                    prevHash = lastLog.details.hash;
                }
            } catch (hashErr) {
                console.warn('[AUDIT HASH] Failed to fetch last log, using default base block:', hashErr.message);
            }

            // Generate cryptographic SHA-256 hash chaining
            const crypto = require('crypto');
            const logString = `${timestamp}|${eventCategory}|${action}|${finalSeverity}|${userId || ''}|${ipAddress || ''}|${JSON.stringify(details)}|${prevHash}`;
            const currentHash = crypto.createHash('sha256').update(logString).digest('hex');

            const detailsWithChain = {
                ...details,
                hash: currentHash,
                prevHash: prevHash
            };

            await AuditLog.create({
                user_id: userId || details.userId || null,
                action: action,
                resource: details.resource || eventCategory,
                resource_id: String(details.resourceId || details.patientId || details.incidentId || ''),
                ip_address: ipAddress || details.ipAddress || null,
                severity: finalSeverity,
                category: eventCategory,
                details: detailsWithChain
            });

            // If it is critical, trigger a suspicious activity notification/alert to connected admins
            if (finalSeverity === 'CRITICAL') {
                const { io } = require('../server'); // lazy load socket.io from server
                if (io) {
                    io.to('role:city_admin').emit('suspicious-activity-alert', {
                        category: eventCategory,
                        action,
                        userId,
                        ipAddress,
                        timestamp,
                        details
                    });
                }
            }
        }
    } catch (dbErr) {
        console.error('[AUDIT DB ERROR] Failed to save audit log to DB:', dbErr.message);
    }
}

module.exports = { logAudit };
