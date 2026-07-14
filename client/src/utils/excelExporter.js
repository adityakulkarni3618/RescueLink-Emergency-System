import * as XLSX from 'xlsx';

/**
 * Multi-Sheet Excel Exporter for RescueLink Dashboard Metrics
 */
export const exportMetricsToExcel = (data) => {
  const { incidents = [], bloodInventory = [], payments = [] } = data;

  // 1. Create a new blank workbook
  const wb = XLSX.utils.book_new();

  // 2. Format Incidents Log Sheet
  const incidentRows = incidents.map(inc => ({
    'Incident ID': inc.id,
    'Patient Name': inc.patientName || 'Anonymous',
    'Ambulance ID': inc.ambulanceId || 'N/A',
    'Hospital': inc.hospitalName || 'N/A',
    'NEWS2 Score': inc.news2Score || 0,
    'Status': inc.status || 'completed',
    'Date / Time': inc.createdAt ? new Date(inc.createdAt).toLocaleString() : new Date().toLocaleString()
  }));
  
  const wsIncidents = XLSX.utils.json_to_sheet(incidentRows.length > 0 ? incidentRows : [
    { 'Incident ID': 'No records', 'Patient Name': '-', 'Ambulance ID': '-', 'Hospital': '-', 'NEWS2 Score': '-', 'Status': '-', 'Date / Time': '-' }
  ]);
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Incidents Log');

  // 3. Format Blood Bank Inventory Sheet
  const bloodRows = bloodInventory.map(bank => ({
    'Blood Bank Name': bank.name,
    'Emergency 24x7': bank.emergency24x7 ? 'YES' : 'NO',
    'Contact Phone': bank.phone,
    'A+': bank.inventory?.['A+'] || 0,
    'A-': bank.inventory?.['A-'] || 0,
    'B+': bank.inventory?.['B+'] || 0,
    'B-': bank.inventory?.['B-'] || 0,
    'O+': bank.inventory?.['O+'] || 0,
    'O-': bank.inventory?.['O-'] || 0,
    'AB+': bank.inventory?.['AB+'] || 0,
    'AB-': bank.inventory?.['AB-'] || 0
  }));
  
  const wsBlood = XLSX.utils.json_to_sheet(bloodRows.length > 0 ? bloodRows : [
    { 'Blood Bank Name': 'No records', 'Emergency 24x7': '-', 'Contact Phone': '-', 'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0, 'O+': 0, 'O-': 0, 'AB+': 0, 'AB-': 0 }
  ]);
  XLSX.utils.book_append_sheet(wb, wsBlood, 'Blood Inventory');

  // 4. Format Financial Claims Sheet
  const paymentRows = payments.map(pay => ({
    'Transaction ID': pay.id,
    'Incident Reference': pay.incidentId,
    'Patient Name': pay.patientName || 'Anonymous',
    'Admitted Hospital': pay.hospitalName || 'N/A',
    'Insurance Claim Amount': pay.amount || 15000,
    'Payment Gateway': pay.gateway || 'Razorpay',
    'Payment Status': pay.status || 'Success',
    'Timestamp': pay.timestamp ? new Date(pay.timestamp).toLocaleString() : new Date().toLocaleString()
  }));

  const wsPayments = XLSX.utils.json_to_sheet(paymentRows.length > 0 ? paymentRows : [
    { 'Transaction ID': 'No records', 'Incident Reference': '-', 'Patient Name': '-', 'Admitted Hospital': '-', 'Insurance Claim Amount': 0, 'Payment Gateway': '-', 'Payment Status': '-', 'Timestamp': '-' }
  ]);
  XLSX.utils.book_append_sheet(wb, wsPayments, 'Financial Claims');

  // 5. Generate and download xlsx file
  XLSX.writeFile(wb, `RescueLink_Metrics_Ledger_${Date.now()}.xlsx`);
};
