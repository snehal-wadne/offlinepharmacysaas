/**
 * Prescription Service
 *
 * Handles clinical prescription records, doctor associations, and dispensing status.
 */

const { pool } = require('../db/connection');
const prescriptionRepo = require('../repositories/prescription.repository');

class PrescriptionService {
  async createPrescription(data) {
    const {
      organisationId,
      customerId,
      doctorName,
      specialization,
      hospitalOrClinic,
      doctorRegistrationNumber,
      chronicConditions,
      drugAllergies,
      prescriptionDate,
      status = 'ACTIVE',
      notes,
    } = data;

    if (!organisationId || !customerId || !doctorName) {
      throw new Error('organisationId, customerId, and doctorName are required');
    }

    const prescription = await prescriptionRepo.createPrescription({
      organisationId,
      customerId,
      doctorName: doctorName.trim(),
      specialization: specialization?.trim() || null,
      hospitalOrClinic: hospitalOrClinic?.trim() || null,
      doctorRegistrationNumber: doctorRegistrationNumber?.trim() || null,
      chronicConditions: chronicConditions?.trim() || null,
      drugAllergies: drugAllergies?.trim() || null,
      prescriptionDate: prescriptionDate || new Date(),
      status: status || 'ACTIVE',
      notes: notes?.trim() || null,
    });

    // Update customer's activeRxNo if applicable
    if (prescription?.prescription_number) {
      await pool.query(
        'UPDATE customers SET active_rx_no = $1, doctor_name = $2 WHERE id = $3 AND organisation_id = $4;',
        [prescription.prescription_number, doctorName.trim(), customerId, organisationId]
      ).catch(() => {});
    }

    return prescription;
  }

  async getPrescriptions({ organisationId, customerId, search, status, limit = 50, offset = 0 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let query = `
      SELECT 
        p.id,
        p.organisation_id AS "organisationId",
        p.customer_id AS "customerId",
        c.full_name AS "customerName",
        c.phone AS "customerPhone",
        p.prescription_number AS "prescriptionNumber",
        p.prescription_reference AS "prescriptionReference",
        p.doctor_name AS "doctorName",
        p.specialization,
        p.hospital_or_clinic AS "hospitalOrClinic",
        p.doctor_registration_number AS "doctorRegistrationNumber",
        p.chronic_conditions AS "chronicConditions",
        p.drug_allergies AS "drugAllergies",
        p.prescription_date AS "prescriptionDate",
        p.status,
        p.notes,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM prescriptions p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.organisation_id = $1
    `;
    const values = [organisationId];

    if (customerId) {
      values.push(customerId);
      query += ` AND p.customer_id = $${values.length}`;
    }

    if (status) {
      values.push(status.toUpperCase());
      query += ` AND UPPER(p.status) = $${values.length}`;
    }

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (
        p.prescription_number ILIKE $${values.length} OR
        p.doctor_name ILIKE $${values.length} OR
        c.full_name ILIKE $${values.length} OR
        c.phone ILIKE $${values.length}
      )`;
    }

    query += ` ORDER BY p.prescription_date DESC, p.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2};`;
    values.push(limit, offset);

    const res = await pool.query(query, values);
    return res.rows;
  }

  async getPrescriptionById(organisationId, id) {
    if (!organisationId || !id) {
      throw new Error('organisationId and id are required');
    }

    const query = `
      SELECT 
        p.*,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        c.age AS customer_age,
        c.gender AS customer_gender
      FROM prescriptions p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.id = $1 AND p.organisation_id = $2
      LIMIT 1;
    `;
    const res = await pool.query(query, [id, organisationId]);
    return res.rows[0] || null;
  }

  async updatePrescriptionStatus(organisationId, id, status) {
    if (!organisationId || !id || !status) {
      throw new Error('organisationId, id, and status are required');
    }

    let normalizedStatus = status.toUpperCase().trim();
    if (normalizedStatus === 'DISPENSED') {
      normalizedStatus = 'EXPIRED'; // Dispensed prescriptions expire for further dispensing
    }
    const validStatuses = ['ACTIVE', 'EXPIRED', 'CANCELLED'];
    if (!validStatuses.includes(normalizedStatus)) {
      normalizedStatus = 'ACTIVE';
    }

    const res = await pool.query(`
      UPDATE prescriptions
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organisation_id = $3
      RETURNING *;
    `, [normalizedStatus, id, organisationId]);

    return res.rows[0] || null;
  }
}

module.exports = new PrescriptionService();
