/**
 * Express middleware to automatically mask patient sensitive data in outgoing JSON responses
 * depending on the user's role.
 */

function maskPatientData(userRole, data) {
  if (data === null || data === undefined) return data;

  // Doctors, Hospital Admins, and City Admins are authorized to view full, decrypted data
  if (['doctor', 'hospital_admin', 'city_admin'].includes(userRole)) {
    return data;
  }

  // Handle arrays recursively
  if (Array.isArray(data)) {
    return data.map(item => maskPatientData(userRole, item));
  }

  // Handle objects recursively
  if (typeof data === 'object') {
    // Determine if the object is a Patient or contains Patient attributes
    const isPatient = data.hasOwnProperty('abha_number') || data.hasOwnProperty('emergency_contact_mobile');
    
    // Create a shadow copy
    let maskedObj = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        maskedObj[key] = data[key];
      }
    }

    if (isPatient) {
      if (maskedObj.name) {
        maskedObj.name = maskedObj.name_masked || maskedObj.name.split(' ').map(n => n[0] + '*'.repeat(Math.max(0, n.length - 1))).join(' ');
      }
      if (maskedObj.abha_number) {
        maskedObj.abha_number = 'XX-XXXX-XXXX-XX' + String(maskedObj.abha_number).slice(-2);
      }
      if (maskedObj.emergency_contact_mobile) {
        maskedObj.emergency_contact_mobile = 'XXXXXX' + String(maskedObj.emergency_contact_mobile).slice(-4);
      }
      if (maskedObj.dob) {
        maskedObj.dob = 'XXXX-XX-XX';
      }
    }

    // Mask nested objects
    for (const key in maskedObj) {
      if (maskedObj.hasOwnProperty(key) && maskedObj[key] !== null && typeof maskedObj[key] === 'object') {
        maskedObj[key] = maskPatientData(userRole, maskedObj[key]);
      }
    }

    return maskedObj;
  }

  return data;
}

module.exports = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function (body) {
    const userRole = req.user ? req.user.role : null;
    const maskedBody = maskPatientData(userRole, body);
    return originalJson.call(this, maskedBody);
  };
  
  next();
};
